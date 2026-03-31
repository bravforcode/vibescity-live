
import stripe
import os
from dotenv import load_dotenv

load_dotenv()

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

def create_product_with_price(name, unit_amount_thb, interval="month"):
    print(f"Creating product: {name}...")
    product = stripe.Product.create(
        name=name,
        description=f"{name} subscription",
    )

    price = stripe.Price.create(
        product=product.id,
        unit_amount=unit_amount_thb * 100, # Stripe uses cents/satang
        currency="thb",
        recurring={"interval": interval},
    )

    print(f"Success! Product ID: {product.id}, Price ID: {price.id}")
    return product.id, price.id

if __name__ == "__main__":
    products = [
        ("VIP Bundle", 5000),
        ("Video Pin", 1500),
        ("Partner Program", 899),
    ]

    results = {}
    for name, amount in products:
        p_id, pr_id = create_product_with_price(name, amount)
        results[name] = {"product_id": p_id, "price_id": pr_id}

    print("\n--- RESULTS ---")
    for name, ids in results.items():
        print(f"{name}: {ids['price_id']}")
