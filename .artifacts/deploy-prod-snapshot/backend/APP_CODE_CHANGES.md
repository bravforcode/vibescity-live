# VibeCity App Code Changes — After DB Migration

**After running `fix_db_critical_issues.sql`, update these files:**

---

## 1️⃣ COIN BALANCE — Use Ledger as Single Source of Truth

### Problem
```python
# ❌ BEFORE: Direct updates (race condition!)
async def claim_daily_checkin(user_id: UUID):
    user_stats = db.query(UserStats).filter_by(user_id=user_id).first()
    user_stats.balance += 100  # Race condition if two requests hit simultaneously
    user_stats.updated_at = datetime.now()
    db.commit()
```

### Solution
```python
# ✅ AFTER: Use ledger-based function (atomic, safe)
async def claim_daily_checkin(user_id: UUID, idempotency_key: str):
    """
    Safe coin grant using ledger-based function.
    idempotency_key prevents double-spend on retry.
    """
    result = db.execute(
        text("""
            SELECT * FROM add_coin_transaction(
                :user_id,
                100,
                'Daily check-in reward',
                'reward',
                :idempotency_key
            )
        """),
        {
            "user_id": user_id,
            "idempotency_key": idempotency_key  # e.g., f"{user_id}_{date}_checkin"
        }
    ).fetchone()

    if result and result[1]:  # success=True
        return {"balance": result[0], "success": True}
    else:
        raise HTTPException(status_code=500, detail="Failed to claim reward")
```

### Where to Apply
- **File:** `backend/app/api/routers/coins.py` (or similar)
- **Functions to update:**
  - `claim_daily_checkin()`
  - `grant_spin_reward()`
  - `grant_friend_referral()`
  - `process_purchase_refund()`
  - Any function that updates `user_stats.balance`

### Client Side (Frontend)
```javascript
// src/composables/useCoinStore.js or similar
const claimDailyCheckin = async () => {
  const idempotencyKey = `${userId}_${today}_checkin`;  // Unique per day per user

  return await fetch('/api/coins/claim-checkin', {
    method: 'POST',
    headers: {
      'Idempotency-Key': idempotencyKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action: 'daily_checkin' })
  });
};
```

---

## 2️⃣ PAYMENT IDEMPOTENCY — Prevent Double Charges

### Problem
```python
# ❌ BEFORE: User double-clicks "Pay" → 2 charges
async def create_order(payment_req: PaymentRequest):
    order = Order(
        user_id=user_id,
        amount=100.00,
        status='pending',
        # No idempotency_key!
    )
    db.add(order)
    db.commit()
    return order
```

### Solution
```python
# ✅ AFTER: Use idempotency_key header
from typing import Optional

async def create_order(
    payment_req: PaymentRequest,
    idempotency_key: str = Header(...)
):
    """
    Creates order with idempotency protection.
    Same idempotency_key always returns same order (safe for retries).
    """
    try:
        order = Order(
            user_id=user_id,
            amount=payment_req.amount,
            status='pending',
            idempotency_key=idempotency_key  # e.g., uuid.uuid4()
        )
        db.add(order)
        db.commit()
        return {"order_id": order.id, "status": "created"}

    except IntegrityError as e:
        # Idempotency key already exists → return existing order
        db.rollback()
        existing = db.query(Order).filter_by(
            idempotency_key=idempotency_key
        ).first()
        return {"order_id": existing.id, "status": "already_created"}
```

### Client Side
```javascript
// src/composables/useCheckout.js
const submitPayment = async (paymentData) => {
  const idempotencyKey = crypto.randomUUID();  // Generate once per request

  try {
    const response = await fetch('/api/orders/create', {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paymentData)
    });

    // Retry safely with same key
    if (!response.ok) {
      return await submitPayment(paymentData);  // Same key = same result
    }
  } catch (error) {
    // Network error → retry is safe (same key)
    return await submitPayment(paymentData);
  }
};
```

### Where to Apply
- **Files:**
  - `backend/app/api/routers/orders.py` — `POST /orders`
  - `backend/app/api/routers/payments.py` — `POST /payments`
  - `backend/app/api/routers/redemptions.py` — `POST /coupons/redeem`

---

## 3️⃣ STRIPE WEBHOOK — Double-Click Protection

### Current (Good)
```python
# supabase/functions/stripe-webhook/index.ts
async function handleWebhook(event: StripeEvent) {
  // ✅ Prevents duplicate Stripe events (event.id deduplication)
  const existing = await db.from('stripe_webhook_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .single();

  if (existing) return { received: true };  // Already processed

  // Process event...
}
```

### Enhanced (Idempotency at Transaction Level)
```typescript
// ✅ NEW: Also check idempotency_key on orders
async function handlePaymentSuccess(event: StripeEvent) {
  const sessionId = event.data.object.id;
  const metadata = event.data.object.metadata;
  const idempotencyKey = metadata.idempotency_key;  // Must come from client

  // Check 1: Stripe event deduplication (prevents duplicate Stripe events)
  const existingEvent = await db.from('stripe_webhook_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .single();

  if (existingEvent) {
    return { received: true, note: 'Stripe event already processed' };
  }

  // Check 2: Order idempotency (prevents double-click checkout)
  if (idempotencyKey) {
    const existingOrder = await db.from('orders')
      .select('id, status')
      .eq('idempotency_key', idempotencyKey)
      .single();

    if (existingOrder && existingOrder.status !== 'pending') {
      // Order already fulfilled, skip fulfillment
      await insertWebhookEvent(event);
      return { received: true, note: 'Order already fulfilled (idempotency)' };
    }
  }

  // Safe to fulfill order
  await fulfillOrder(sessionId);
  await insertWebhookEvent(event);
  return { received: true, fulfilled: true };
}

async function insertWebhookEvent(event: StripeEvent) {
  return await db.from('stripe_webhook_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    payload: event.data,
    processed_at: new Date()
  });
}
```

### Where to Apply
- **File:** `supabase/functions/stripe-webhook/index.ts`
- **Key changes:**
  - Extract `idempotency_key` from `event.data.object.metadata`
  - Check order status before fulfillment
  - Insert webhook event last (after fulfillment)

---

## 4️⃣ DELETED VENUES — Always Use is_deleted = false

### Problem
```sql
-- ❌ BEFORE: Easy to forget deleted_at check
SELECT * FROM venues WHERE province = 'Bangkok';
-- Returns deleted venues!
```

### Solution
```sql
-- ✅ AFTER: Always filter by is_deleted = false
SELECT * FROM venues WHERE province = 'Bangkok' AND is_deleted = false;

-- Or use helper index
CREATE INDEX idx_venues_is_deleted ON venues(is_deleted) WHERE is_deleted = false;
```

### Python Code
```python
# ✅ Update ORM queries
@router.get("/venues")
async def list_venues(province: str, db: Session):
    venues = db.query(Venue).filter(
        Venue.province == province,
        Venue.is_deleted == False  # ← Add this to ALL queries
    ).all()
    return venues

# Or create helper method
class VenueService:
    @staticmethod
    def get_active_venues(db: Session, **filters):
        query = db.query(Venue).filter(Venue.is_deleted == False)
        for key, value in filters.items():
            if value:
                query = query.filter(getattr(Venue, key) == value)
        return query.all()

    # Usage
    venues = VenueService.get_active_venues(db, province='Bangkok')
```

### Where to Apply
- **Files:**
  - `backend/app/api/routers/venues.py` — All SELECT queries
  - `backend/app/services/venues.py` — All venue fetches
  - Search service, feed service, etc.

**Rule:** Any `SELECT * FROM venues` must include `AND is_deleted = false` or `AND is_deleted != true`

---

## 5️⃣ VISITOR COINS (Anonymous Users)

### Problem
```python
# ❌ BEFORE: No idempotency for visitor coins
async def add_visitor_reward(visitor_id: str, amount: int):
    stats = db.query(VisitorStats).filter_by(visitor_id=visitor_id).first()
    stats.balance += amount  # Race condition
    db.commit()
```

### Solution
```python
# ✅ AFTER: Use visitor coin function
async def add_visitor_reward(visitor_id: str, amount: int, idempotency_key: str):
    result = db.execute(
        text("""
            SELECT * FROM add_visitor_coins(
                :visitor_id,
                :amount,
                'visitor_reward',
                :idempotency_key
            )
        """),
        {
            "visitor_id": visitor_id,
            "amount": amount,
            "idempotency_key": idempotency_key  # e.g., f"{visitor_id}_{event_id}"
        }
    ).fetchone()
    return {"balance": result[0]}
```

---

## 📋 Checklist

- [ ] **Coin claims**: Update all `user_stats.balance +=` to use `add_coin_transaction()`
- [ ] **Visitor coins**: Update all `visitor_gamification_stats.balance +=` to use `add_visitor_coins()`
- [ ] **Payment checkout**: Add `idempotency_key` header to POST /orders, /payments, /redemptions
- [ ] **Stripe webhook**: Extract `idempotency_key` from metadata, check order status
- [ ] **Venue queries**: Add `AND is_deleted = false` to all SELECT * FROM venues
- [ ] **Test**: Try double-click checkout → should return same order, not create 2
- [ ] **Test**: Try double-click daily checkin → should return existing balance, not grant twice
- [ ] **Monitor**: Log all idempotency key conflicts to detect bugs

---

## Testing

```bash
# Run after code changes
pytest backend/tests/test_idempotency.py
pytest backend/tests/test_coins.py
pytest backend/tests/test_stripe_webhook.py
pytest backend/tests/test_soft_delete.py

# Manual test: Double-click checkout
curl -X POST http://localhost:8001/api/orders/create \
  -H "Idempotency-Key: test-123" \
  -H "Content-Type: application/json" \
  -d '{"amount": 100}'

# Run again with same key → should get same order ID
curl -X POST http://localhost:8001/api/orders/create \
  -H "Idempotency-Key: test-123" \
  -H "Content-Type: application/json" \
  -d '{"amount": 100}'
# Expected: Same order_id returned ✓
```

---

## Priority Order

1. **Stripe webhook idempotency** (payment safety — do first!)
2. **Coin ledger functions** (balance integrity)
3. **Payment idempotency** (prevent double charges)
4. **Soft delete filtering** (data consistency)
5. **Visitor coins** (if applicable)
