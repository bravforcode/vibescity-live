<template>
  <div class="admin-view p-4 md:p-6 bg-gray-900 min-h-screen text-white">
    <div
      class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6"
    >
      <div>
        <h1 class="text-3xl font-bold">{{ $t("auto.k_4fb9b4c0") }}</h1>
        <p class="text-sm text-gray-400"> {{ $t("auto.k_66ab3e") }} </p>
      </div>

      <div
        v-if="userStore.isAdmin"
        class="flex flex-wrap gap-2"
        role="tablist"
        :aria-label="$t('auto.k_c8554678')"
        @keydown="handleTabKeydown"
      >
        <button
          type="button"
          data-tab="review"
          id="admin-tab-review"
          :tabindex="activeTab === 'review' ? 0 : -1"
          role="tab"
          :aria-selected="activeTab === 'review'"
          :class="[
            'px-3 py-2 rounded-lg border text-sm font-semibold transition-colors duration-150',
            activeTab === 'review'
              ? 'bg-white/10 border-white/20 text-white'
              : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:border-gray-600',
          ]"
          @click="setActiveTab('review')"
        > {{ $t("auto.k_9d5de7c1") }}{{ pendingShops.length }})
        </button>
        <button
          type="button"
          data-tab="slips"
          id="admin-tab-slips"
          :tabindex="activeTab === 'slips' ? 0 : -1"
          role="tab"
          :aria-selected="activeTab === 'slips'"
          :class="[
            'px-3 py-2 rounded-lg border text-sm font-semibold transition-colors duration-150',
            activeTab === 'slips'
              ? 'bg-white/10 border-white/20 text-white'
              : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:border-gray-600',
          ]"
          @click="setActiveTab('slips')"
        > {{ $t("auto.k_2e5990") }}{{ slipSummary.total }})
        </button>
        <button
          type="button"
          data-tab="usage"
          id="admin-tab-usage"
          :tabindex="activeTab === 'usage' ? 0 : -1"
          role="tab"
          :aria-selected="activeTab === 'usage'"
          :class="[
            'px-3 py-2 rounded-lg border text-sm font-semibold transition-colors duration-150',
            activeTab === 'usage'
              ? 'bg-white/10 border-white/20 text-white'
              : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:border-gray-600',
          ]"
          @click="setActiveTab('usage')"
        > {{ $t("auto.k_4046eae0") }} </button>
        <button
          type="button"
          data-tab="pii"
          id="admin-tab-pii"
          :tabindex="activeTab === 'pii' ? 0 : -1"
          role="tab"
          :aria-selected="activeTab === 'pii'"
          :class="[
            'px-3 py-2 rounded-lg border text-sm font-semibold transition-colors duration-150',
            activeTab === 'pii'
              ? 'bg-white/10 border-white/20 text-white'
              : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:border-gray-600',
          ]"
          @click="setActiveTab('pii')"
        > {{ $t("auto.k_1b02dffa") }} </button>
        <button
          type="button"
          data-tab="ads"
          id="admin-tab-ads"
          :tabindex="activeTab === 'ads' ? 0 : -1"
          role="tab"
          :aria-selected="activeTab === 'ads'"
          :class="[
            'px-3 py-2 rounded-lg border text-sm font-semibold transition-colors duration-150',
            activeTab === 'ads'
              ? 'bg-white/10 border-white/20 text-white'
              : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:border-gray-600',
          ]"
          @click="setActiveTab('ads')"
        > {{ $t("auto.k_12fed442") }} </button>

        <span class="hidden sm:inline text-gray-600 px-1">|</span>

        <button
          v-for="dt in dataTabs"
          :key="dt.id"
          type="button"
          :data-tab="dt.id"
          :id="'admin-tab-' + dt.id"
          :tabindex="activeTab === dt.id ? 0 : -1"
          role="tab"
          :aria-selected="activeTab === dt.id"
          :class="[
            'px-3 py-2 rounded-lg border text-sm font-semibold transition-colors duration-150',
            activeTab === dt.id
              ? 'bg-indigo-600/30 border-indigo-400/40 text-white'
              : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:border-gray-600',
          ]"
          @click="setActiveTab(dt.id)"
        >
          {{ dt.icon }} {{ dt.label }}
        </button>
      </div>
    </div>

    <div
      v-if="!userStore.isAdmin"
      class="mb-6 rounded-xl border border-gray-700 bg-gray-800/70 p-5 max-w-2xl"
    >
      <h2 class="text-lg font-semibold">{{ $t("auto.k_e280580d") }}</h2>
      <p class="mt-1 text-sm text-gray-300"> {{ $t("auto.k_e9333b") }} </p>
      <div class="mt-4 grid gap-3">
        <input :aria-label="$t('a11y.input_field')"
          v-model.trim="adminAuthEmail"
          type="email"
          autocomplete="email"
          class="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
          :placeholder="$t('auto.k_f731277f')"
        />
        <input :aria-label="$t('a11y.input_field')"
          v-model="adminAuthPassword"
          type="password"
          autocomplete="current-password"
          class="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
          :placeholder="$t('auto.k_30b9119b')"
        />
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-60"
            :disabled="adminAuthLoading"
            @click="handleAdminSignIn"
          >
            {{ adminAuthLoading ? "Signing in..." : "Sign in" }}
          </button>
          <button
            type="button"
            class="rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-600 disabled:opacity-60"
            :disabled="adminAuthLoading"
            @click="sendAdminMagicLink"
          > {{ $t("auto.k_7305770c") }} </button>
        </div>
        <p
          v-if="adminAuthMessage"
          class="text-sm"
          :class="
            adminAuthMessageType === 'error'
              ? 'text-red-300'
              : 'text-emerald-300'
          "
        >
          {{ adminAuthMessage }}
        </p>
      </div>
    </div>

    <div v-if="userStore.isAdmin">
      <!-- Pending Review -->
      <div v-if="activeTab === 'review'">
        <div
          v-if="error"
          class="mb-4 rounded-xl border border-red-500/40 bg-red-950/40 p-4 text-red-100"
          role="alert"
        >
          <div class="text-sm font-bold">{{ $t("auto.k_43592c43") }}</div>
          <p class="mt-1 text-xs text-red-200/90">{{ error }}</p>
          <button
            type="button"
            class="mt-3 rounded-lg bg-red-500/20 border border-red-400/40 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-500/30 transition-colors"
            @click="fetchPending"
          >
            Retry
          </button>
        </div>

        <div v-if="loading" class="grid gap-3 py-3" aria-live="polite">
          <div
            v-for="idx in 3"
            :key="`pending-skeleton-${idx}`"
            class="h-32 rounded-xl border border-gray-700 bg-gray-800/70 animate-pulse"
          ></div>
        </div>

        <div v-else>
          <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 class="text-xl font-semibold">{{ $t("auto.k_3bf4a801") }}</h2>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-700 transition-colors"
                :disabled="isBulkModerating"
                :class="{ 'cursor-not-allowed opacity-50': isBulkModerating }"
                @click="toggleAllPendingSelections"
              >
                {{ allPendingSelected ? adminUiText("Clear selection", "ล้างการเลือก") : adminUiText(`Select all (${pendingShops.length})`, `เลือกทั้งหมด (${pendingShops.length})`) }}
              </button>
              <button
                type="button"
                class="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-500 transition-colors disabled:opacity-50"
                :disabled="selectedPendingCount === 0 || isBulkModerating"
                @click="handleBulkApprove"
              >
                {{
                  bulkPendingAction === "approve"
                    ? adminUiText("Approving...", "กำลังอนุมัติ...")
                    : adminUiText(`Approve selected (${selectedPendingCount})`, `อนุมัติที่เลือก (${selectedPendingCount})`)
                }}
              </button>
              <button
                type="button"
                class="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500 transition-colors disabled:opacity-50"
                :disabled="selectedPendingCount === 0 || isBulkModerating"
                @click="handleBulkReject"
              >
                {{
                  bulkPendingAction === "reject"
                    ? adminUiText("Rejecting...", "กำลังปฏิเสธ...")
                    : adminUiText(`Reject selected (${selectedPendingCount})`, `ปฏิเสธที่เลือก (${selectedPendingCount})`)
                }}
              </button>
            </div>
          </div>

          <div
            class="mb-4 rounded-xl border border-gray-700 bg-gray-800/70 px-4 py-3"
            aria-live="polite"
          >
            <p class="text-sm font-medium text-gray-200">
              {{ pendingSelectionSummary }}
            </p>
            <p v-if="bulkPendingLabel" class="mt-1 text-xs text-amber-300">
              {{ bulkPendingLabel }}
            </p>
          </div>

          <div
            v-if="pendingShops.length === 0"
            class="rounded-xl border border-gray-700 bg-gray-800/70 p-4 text-gray-300"
          >
            <p>{{ $t("auto.k_9991e3ea") }}</p>
            <button
              type="button"
              class="mt-3 rounded-lg bg-gray-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-600 transition-colors"
              @click="fetchPending"
            >
              Refresh
            </button>
          </div>

          <div class="grid gap-4">
            <div
              v-for="shop in pendingShops"
              :key="shop.id"
              class="bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700 flex flex-col md:flex-row gap-4"
            >
              <!-- Image Preview -->
              <div
                class="w-full md:w-48 h-32 bg-gray-700 rounded overflow-hidden"
              >
                <img loading="lazy"
                  v-if="shop.images && shop.images.length"
                  :src="shop.images[0]"
                  class="w-full h-full object-cover"
                  :alt="$t('auto.k_d50ee809')"
                />
                <div
                  v-else
                  class="flex items-center justify-center h-full text-gray-500"
                > {{ $t("auto.k_24a02503") }} </div>
              </div>

              <!-- Content -->
              <div class="flex-1">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h3 class="text-xl font-bold">{{ shop.name }}</h3>
                    <p class="text-sm text-gray-400 mb-2">
                      {{ shop.category }} • {{ shop.province }}
                    </p>
                  </div>
                  <label class="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-gray-200">
                    <input
                      :checked="isPendingShopSelected(shop.id)"
                      :disabled="isPendingReviewAction(shop.id) || isBulkModerating"
                      type="checkbox"
                      class="rounded border-gray-500 bg-gray-800 text-green-500 focus:ring-green-400"
                      @change="togglePendingShopSelection(shop.id)"
                    />
                    <span>{{ adminUiText("Select", "เลือก") }}</span>
                  </label>
                </div>
                <p class="text-gray-300 mb-4">
                  {{ shop.description || "No description provided." }}
                </p>

                <div class="flex gap-2">
                  <button
                    @click="handleApprove(shop.id)"
                    :disabled="isPendingReviewAction(shop.id) || isBulkModerating"
                    class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded transition-colors duration-150"
                    :class="{ 'cursor-not-allowed opacity-60': isPendingReviewAction(shop.id) || isBulkModerating }"
                  > {{ isPendingReviewAction(shop.id) ? adminUiText("Working...", "กำลังดำเนินการ...") : $t("auto.k_a6987039") }} </button>
                  <button
                    @click="openPromoteModal(shop.id)"
                    :disabled="isPendingReviewAction(shop.id) || isBulkModerating"
                    class="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded transition-colors duration-150"
                    :class="{ 'cursor-not-allowed opacity-60': isPendingReviewAction(shop.id) || isBulkModerating }"
                  > {{ isPendingReviewAction(shop.id) ? adminUiText("Working...", "กำลังดำเนินการ...") : $t("auto.k_6ff4dcfa") }} </button>
                  <button
                    @click="handleReject(shop.id)"
                    :disabled="isPendingReviewAction(shop.id) || isBulkModerating"
                    class="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded transition-colors duration-150"
                    :class="{ 'cursor-not-allowed opacity-60': isPendingReviewAction(shop.id) || isBulkModerating }"
                  >
                    {{ isPendingReviewAction(shop.id) ? adminUiText("Working...", "กำลังดำเนินการ...") : "Reject" }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Slip Verification Dashboard -->
      <div v-if="activeTab === 'slips'" class="mt-6">
        <div
          class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4"
        >
          <div>
            <h2 class="text-xl font-semibold">{{ $t("auto.k_24799855") }}</h2>
            <p class="text-sm text-gray-400"> {{ $t("auto.k_b98f0395") }} </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              @click="fetchSlipLogs"
              class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded transition"
            > {{ $t("auto.k_e6beb897") }} </button>
            <button
              @click="runSheetSync"
              :disabled="sheetSyncLoading"
              class="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white px-4 py-2 rounded transition"
            >
              {{ sheetSyncLoading ? "Syncing..." : "Sync Google Sheets" }}
            </button>
          </div>
        </div>
        <p v-if="sheetSyncMessage" class="mb-3 text-sm text-emerald-300">
          {{ sheetSyncMessage }}
        </p>
        <p v-if="sheetSyncError" class="mb-3 text-sm text-red-300">
          {{ sheetSyncError }}
        </p>
        <pre
          v-if="sheetSyncStats"
          class="mb-3 rounded-lg border border-gray-700 bg-gray-950 p-3 text-xs text-gray-200 overflow-x-auto"
          >{{ JSON.stringify(sheetSyncStats, null, 2) }}</pre
        >

        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
            <div class="text-xs text-gray-400">Total</div>
            <div class="text-lg font-bold">{{ slipSummary.total }}</div>
          </div>
          <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
            <div class="text-xs text-gray-400">Paid</div>
            <div class="text-lg font-bold text-green-400">
              {{ slipSummary.paid }}
            </div>
          </div>
          <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
            <div class="text-xs text-gray-400">Rejected</div>
            <div class="text-lg font-bold text-red-400">
              {{ slipSummary.rejected }}
            </div>
          </div>
          <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
            <div class="text-xs text-gray-400">Pending</div>
            <div class="text-lg font-bold text-yellow-400">
              {{ slipSummary.pending }}
            </div>
          </div>
        </div>

        <div class="flex flex-col md:flex-row gap-3 mb-4">
          <input
            v-model="slipSearch"
            type="search"
            :aria-label="$t('auto.k_cfa8bf92')"
            autocomplete="off"
            :placeholder="$t('auto.k_67ac924f')"
            class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
          />
          <input
            v-model="slipBuyerName"
            type="text"
            :aria-label="$t('auto.k_b1d352b1')"
            autocomplete="name"
            :placeholder="$t('auto.k_f12f33db')"
            class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
          />
          <input
            v-model="slipBuyerEmail"
            type="email"
            :aria-label="$t('auto.k_7078a956')"
            autocomplete="email"
            :placeholder="$t('auto.k_41322540')"
            class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
          />
          <select
            v-model="slipStatus"
            class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="all">{{ $t("auto.k_6c4b8a4e") }}</option>
            <option value="paid">Paid</option>
            <option value="rejected">Rejected</option>
            <option value="pending">Pending</option>
            <option value="pending_review">{{ $t("auto.k_2f4605c8") }}</option>
          </select>
          <select
            v-model.number="slipLimit"
            class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option :value="25">{{ $t("auto.k_540fba15") }}</option>
            <option :value="50">{{ $t("auto.k_d3680715") }}</option>
            <option :value="100">{{ $t("auto.k_7ee77d39") }}</option>
          </select>
          <select
            v-model="slipExportGroup"
            class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="none">{{ $t("auto.k_8969bdd0") }}</option>
            <option value="status">{{ $t("auto.k_b3235687") }}</option>
            <option value="date">{{ $t("auto.k_e35af265") }}</option>
          </select>
          <button
            @click="fetchSlipLogs"
            class="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded transition"
          > {{ $t("auto.k_a00347a0") }} </button>
        </div>

        <div
          class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4"
        >
          <div class="flex items-center gap-2">
            <button
              @click="prevSlipPage"
              :disabled="slipPage === 1"
              class="px-3 py-1 rounded bg-gray-800 border border-gray-700 text-xs disabled:opacity-50"
            >
              Prev
            </button>
            <div class="text-xs text-gray-400">
              Page {{ slipPage }} / {{ slipTotalPages }}
            </div>
            <button
              @click="nextSlipPage"
              :disabled="slipPage >= slipTotalPages"
              class="px-3 py-1 rounded bg-gray-800 border border-gray-700 text-xs disabled:opacity-50"
            >
              Next
            </button>
          </div>
          <div class="flex flex-col sm:flex-row gap-2">
            <button
              @click="exportSlipLogs('page')"
              class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-xs"
            > {{ $t("auto.k_b04c6959") }} </button>
            <button
              @click="exportSlipLogs('all')"
              class="bg-indigo-700 hover:bg-indigo-600 text-white px-4 py-2 rounded text-xs"
            > {{ $t("auto.k_ad5fd4e6") }} </button>
            <button
              @click="exportSlipLogs('zip')"
              class="bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded text-xs"
            > {{ $t("auto.k_ccdf40e8") }}{{ slipExportGroupLabel }})
            </button>
          </div>
        </div>

        <div v-if="slipError" class="bg-red-500 text-white p-3 rounded mb-4">
          {{ slipError }}
        </div>

        <div v-if="slipLoading" class="text-center py-8 text-gray-400"> {{ $t("auto.k_2dfc65d9") }} </div>

        <div v-else>
          <div v-if="slipLogs.length === 0" class="text-gray-400"> {{ $t("auto.k_d57da2ee") }} </div>
          <div v-else class="grid gap-4">
            <div
              v-for="order in slipLogs"
              :key="order.id"
              class="bg-gray-800 p-4 rounded-lg border border-gray-700"
            >
              <div
                class="flex flex-col md:flex-row md:items-center md:justify-between gap-2"
              >
                <div>
                  <div class="text-xs text-gray-400">{{ $t("auto.k_65238350") }}</div>
                  <div class="text-xs font-mono text-gray-200 break-all">
                    {{ order.id }}
                  </div>
                </div>
                <span
                  class="px-2 py-1 rounded text-xs font-bold uppercase tracking-wide"
                  :class="statusBadgeClass(order.status)"
                >
                  {{ order.status || "unknown" }}
                </span>
              </div>

              <div class="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="md:col-span-1">
                  <div
                    class="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden h-40"
                  >
                    <img loading="lazy"
                      v-if="order.slip_url"
                      :src="order.slip_url"
                      alt="Slip"
                      class="w-full h-full object-cover"
                    />
                    <div
                      v-else
                      class="h-full flex items-center justify-center text-gray-500 text-xs"
                    > {{ $t("auto.k_c38e29c5") }} </div>
                  </div>
                  <a
                    v-if="order.slip_url"
                    :href="order.slip_url"
                    target="_blank"
                    rel="noreferrer"
                    class="text-xs text-blue-400 hover:text-blue-300 block mt-2"
                  > {{ $t("auto.k_ea9eff44") }} </a>
                </div>

                <div class="md:col-span-2 space-y-2 text-sm text-gray-300">
                  <div class="flex flex-wrap gap-4 text-xs text-gray-400">
                    <span
                      >{{ $t("auto.k_1d023b00") }} <span class="text-gray-200">{{ order.sku }}</span></span
                    >
                    <span
                      >{{ $t("auto.k_778beba9") }} <span class="text-gray-200"
                        >฿{{ formatAmount(order.amount) }}</span
                      ></span
                    >
                    <span
                      >{{ $t("auto.k_4b065c52") }} <span class="text-gray-200">{{
                        order.venue_id || "N/A"
                      }}</span></span
                    >
                  </div>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <div class="text-gray-500">Verification</div>
                      <div class="text-gray-200">
                        {{ getSlipMeta(order).status || "unknown" }}
                        <span
                          v-if="getSlipMeta(order).reason"
                          class="text-gray-400"
                        >
                          ({{ getSlipMeta(order).reason }})
                        </span>
                      </div>
                      <div class="text-gray-500 mt-1"> {{ $t("auto.k_410aed4") }} {{ formatDate(getSlipMeta(order).checked_at) }}
                      </div>
                    </div>
                    <div>
                      <div class="text-gray-500">Transaction</div>
                      <div class="text-gray-200"> {{ $t("auto.k_1f187048") }} {{ getSlipMeta(order).trans_ref || "N/A" }}
                      </div>
                      <div class="text-gray-500 mt-1"> {{ $t("auto.k_a5cb7279") }} {{ getSlipMeta(order).trans_date || "N/A" }}
                      </div>
                    </div>
                  </div>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <div class="text-gray-500">Receiver</div>
                      <div class="text-gray-200">
                        {{ getSlipMeta(order).receiver?.name || "N/A" }}
                      </div>
                      <div class="text-gray-400">
                        {{ getSlipMeta(order).receiver?.bank || "N/A" }}
                        · {{ getSlipMeta(order).receiver?.account || "N/A" }}
                      </div>
                    </div>
                    <div>
                      <div class="text-gray-500">Sender</div>
                      <div class="text-gray-200">
                        {{ getSlipMeta(order).sender?.name || "N/A" }}
                      </div>
                      <div class="text-gray-400">
                        {{ getSlipMeta(order).sender?.bank || "N/A" }}
                      </div>
                    </div>
                  </div>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <div class="text-gray-500">{{ $t("auto.k_43322384") }}</div>
                      <div class="text-gray-200">
                        {{ getSlipAudit(order).buyer_full_name || "N/A" }}
                      </div>
                      <div class="text-gray-400">
                        {{ getSlipAudit(order).buyer_phone || "N/A" }} ·
                        {{ getSlipAudit(order).buyer_email || "N/A" }}
                      </div>
                      <div class="text-gray-400 mt-1">
                        {{ getSlipAudit(order).buyer_address_line1 || "N/A" }}
                        <span v-if="getSlipAudit(order).buyer_address_line2"
                          >, {{ getSlipAudit(order).buyer_address_line2 }}</span
                        >
                      </div>
                      <div class="text-gray-400">
                        {{ getSlipAudit(order).buyer_country || "N/A" }} ·
                        {{ getSlipAudit(order).buyer_province || "N/A" }} ·
                        {{ getSlipAudit(order).buyer_district || "N/A" }} ·
                        {{ getSlipAudit(order).buyer_postal || "N/A" }}
                      </div>
                    </div>
                    <div>
                      <div class="text-gray-500">{{ $t("auto.k_953cba20") }}</div>
                      <div class="text-gray-200">
                        {{ getSlipAudit(order).ip_address || "N/A" }}
                      </div>
                      <div class="text-gray-400">
                        {{ getSlipAudit(order).geo_country || "N/A" }} ·
                        {{ getSlipAudit(order).geo_region || "N/A" }} ·
                        {{ getSlipAudit(order).geo_city || "N/A" }} ·
                        {{ getSlipAudit(order).geo_postal || "N/A" }}
                      </div>
                      <div class="text-gray-400 mt-1"> {{ $t("auto.k_e18ede1b") }} {{ getSlipAudit(order).user_agent || "N/A" }}
                      </div>
                    </div>
                  </div>

                  <div class="text-xs text-gray-500"> {{ $t("auto.k_e99881b3") }} {{ formatDate(order.created_at) }}
                    <span class="mx-2">•</span> {{ $t("auto.k_b95fa95e") }} {{ formatDate(order.updated_at) }}
                  </div>

                  <details class="mt-2">
                    <summary class="cursor-pointer text-xs text-blue-300"> {{ $t("auto.k_d38bc22d") }} </summary>
                    <pre
                      class="text-xs bg-gray-900 border border-gray-700 rounded-lg p-3 mt-2 overflow-auto whitespace-pre-wrap"
                      >{{ formatMetadata(order.metadata) }}</pre
                    >
                  </details>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Usage Analytics -->
      <div v-if="activeTab === 'usage'" class="mt-6">
        <div
          class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4"
        >
          <div>
            <h2 class="text-xl font-semibold">{{ $t("auto.k_4046eae0") }}</h2>
            <p class="text-sm text-gray-400"> {{ $t("auto.k_fc51c129") }} </p>
          </div>
          <div class="flex flex-col sm:flex-row gap-2">
            <button
              @click="fetchAnalytics"
              class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded transition-colors duration-150"
            >
              Refresh
            </button>
            <button
              @click="exportAnalytics"
              class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded transition-colors duration-150"
            > {{ $t("auto.k_1f58f993") }} </button>
          </div>
        </div>

        <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label class="text-xs text-gray-400"> {{ $t("auto.k_226aea58") }} <select
                v-model.number="analyticsDays"
                class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option :value="7">{{ $t("auto.k_35b9d98f") }}</option>
                <option :value="14">{{ $t("auto.k_cfbe0421") }}</option>
                <option :value="30">{{ $t("auto.k_d0778b33") }}</option>
              </select>
            </label>

            <label class="text-xs text-gray-400"> {{ $t("auto.k_b0448941") }} <input :aria-label="$t('a11y.input_field')"
                v-model="analyticsCountry"
                placeholder="TH"
                maxlength="8"
                class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>

            <label class="text-xs text-gray-400"> {{ $t("auto.k_d260c880") }} <input :aria-label="$t('a11y.input_field')"
                v-model="analyticsEventType"
                placeholder="venue_view"
                maxlength="64"
                class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
          </div>

          <div class="mt-3 flex flex-col gap-1 text-xs text-gray-400">
            <div v-if="analyticsData?.range"> {{ $t("auto.k_fd2f1658") }} <span class="text-gray-200">{{ analyticsData.range.from }}</span>
              <span class="mx-1">→</span>
              <span class="text-gray-200">{{ analyticsData.range.to }}</span>
              <span class="mx-2">•</span> {{ $t("auto.k_3315e2c7") }} <span class="text-gray-200">{{
                analyticsData.range.sessions_time_column
              }}</span>
              <span v-if="analyticsData?.request_id" class="mx-2">•</span>
              <span v-if="analyticsData?.request_id"> {{ $t("auto.k_7b05f6b8") }} <span class="text-gray-200">{{
                  analyticsData.request_id
                }}</span>
              </span>
            </div>
            <div v-if="analyticsData?.range?.truncated" class="text-yellow-300"> {{ $t("auto.k_619efc5e") }} {{ analyticsData.range.max_session_rows }} {{ $t("auto.k_1beb3be2") }} <code class="text-yellow-200"
                >ANALYTICS_DASHBOARD_MAX_SESSION_ROWS</code
              > {{ $t("auto.k_fec92241") }} </div>
          </div>
        </div>

        <div
          v-if="analyticsError"
          class="mb-4 rounded-xl border border-red-500/40 bg-red-950/40 p-4 text-red-100"
          role="alert"
        >
          <div class="text-sm font-bold">{{ $t("auto.k_b3ef0c39") }}</div>
          <p class="mt-1 text-xs text-red-200/90">{{ analyticsError }}</p>
          <button
            type="button"
            class="mt-3 rounded-lg bg-red-500/20 border border-red-400/40 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-500/30 transition-colors"
            @click="fetchAnalytics"
          >
            Retry
          </button>
        </div>

        <div
          v-if="analyticsLoading"
          class="grid grid-cols-1 md:grid-cols-3 gap-3 py-3"
        >
          <div
            v-for="idx in 6"
            :key="`analytics-skeleton-${idx}`"
            class="h-24 rounded-xl border border-gray-700 bg-gray-800/70 animate-pulse"
          ></div>
        </div>

        <div v-else-if="analyticsData" class="space-y-4">
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
              <div class="text-xs text-gray-400">Sessions</div>
              <div class="text-lg font-bold">
                {{ analyticsData.kpis.sessions_total }}
              </div>
            </div>
            <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
              <div class="text-xs text-gray-400">{{ $t("auto.k_de0efc79") }}</div>
              <div class="text-lg font-bold">
                {{ analyticsData.kpis.unique_visitors_total }}
              </div>
            </div>
            <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
              <div class="text-xs text-gray-400">{{ $t("auto.k_cb3e9c5b") }}</div>
              <div class="text-lg font-bold">
                {{ analyticsData.kpis.live_visitors_15m }}
              </div>
            </div>
            <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
              <div class="text-xs text-gray-400">DAU</div>
              <div class="text-lg font-bold">{{ analyticsData.kpis.dau }}</div>
            </div>
            <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
              <div class="text-xs text-gray-400">WAU</div>
              <div class="text-lg font-bold">{{ analyticsData.kpis.wau }}</div>
            </div>
            <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
              <div class="text-xs text-gray-400">MAU</div>
              <div class="text-lg font-bold">{{ analyticsData.kpis.mau }}</div>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div class="flex items-center justify-between gap-2">
                <h3 class="text-sm font-semibold">{{ $t("auto.k_a38be8cf") }}</h3>
                <div class="text-xs text-gray-500">
                  {{ analyticsData.range.days }} {{ $t("auto.k_e8d7857") }} </div>
              </div>
              <div class="overflow-x-auto mt-3">
                <table class="min-w-full text-sm">
                  <thead>
                    <tr class="text-xs text-gray-400 border-b border-gray-700">
                      <th class="text-left py-2 pr-4">Day</th>
                      <th class="text-right py-2 pr-4">Sessions</th>
                      <th class="text-right py-2">Unique</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in analyticsData.sessions_by_day"
                      :key="row.day"
                      class="border-b border-gray-800"
                    >
                      <td class="py-2 pr-4 text-gray-200">{{ row.day }}</td>
                      <td class="py-2 pr-4 text-right text-gray-200">
                        {{ row.sessions }}
                      </td>
                      <td class="py-2 text-right text-gray-200">
                        {{ row.unique_visitors }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div class="flex items-center justify-between gap-2">
                <h3 class="text-sm font-semibold">{{ $t("auto.k_2cc3afae") }}</h3>
                <div class="text-xs text-gray-500">{{ $t("auto.k_ba99e466") }}</div>
              </div>
              <div class="overflow-x-auto mt-3">
                <table class="min-w-full text-sm">
                  <thead>
                    <tr class="text-xs text-gray-400 border-b border-gray-700">
                      <th class="text-left py-2 pr-4">Country</th>
                      <th class="text-right py-2 pr-4">Sessions</th>
                      <th class="text-right py-2">Unique</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in analyticsData.top_countries"
                      :key="row.country"
                      class="border-b border-gray-800"
                    >
                      <td class="py-2 pr-4 text-gray-200">
                        {{ row.country || "N/A" }}
                      </td>
                      <td class="py-2 pr-4 text-right text-gray-200">
                        {{ row.sessions }}
                      </td>
                      <td class="py-2 text-right text-gray-200">
                        {{ row.unique_visitors }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-sm font-semibold">{{ $t("auto.k_23dce5f7") }}</h3>
              <div class="text-xs text-gray-500">
                {{ analyticsData.recent_sessions?.length || 0 }} rows
              </div>
            </div>

            <div
              v-if="!analyticsData.recent_sessions?.length"
              class="text-xs text-gray-500 mt-3"
            > {{ $t("auto.k_79db7a01") }} </div>

            <div v-else class="overflow-x-auto mt-3">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="text-xs text-gray-400 border-b border-gray-700">
                    <th class="text-left py-2 pr-4">Seen</th>
                    <th class="text-left py-2 pr-4">Visitor</th>
                    <th class="text-left py-2 pr-4">User</th>
                    <th class="text-left py-2 pr-4">Country</th>
                    <th class="text-left py-2 pr-4">City</th>
                    <th class="text-left py-2">Device</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, idx) in analyticsData.recent_sessions"
                    :key="`${row.visitor_id || 'v'}:${idx}`"
                    class="border-b border-gray-800"
                  >
                    <td class="py-2 pr-4 text-gray-200">
                      {{
                        formatDate(
                          row.last_seen_at ||
                            row?.[analyticsData.range.sessions_time_column],
                        )
                      }}
                    </td>
                    <td class="py-2 pr-4 text-gray-200 font-mono text-xs">
                      {{ row.visitor_id || "N/A" }}
                    </td>
                    <td class="py-2 pr-4 text-gray-200 font-mono text-xs">
                      {{ row.user_id || "N/A" }}
                    </td>
                    <td class="py-2 pr-4 text-gray-200">
                      {{ row.country || "N/A" }}
                    </td>
                    <td class="py-2 pr-4 text-gray-200">
                      {{ row.city || "N/A" }}
                    </td>
                    <td class="py-2 text-gray-200">
                      {{ row.device_type || "N/A" }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div
              class="flex flex-col md:flex-row md:items-center md:justify-between gap-2"
            >
              <div>
                <h3 class="text-sm font-semibold">Events</h3>
                <div class="text-xs text-gray-500"> {{ $t("auto.k_d9c7ca66") }} <span class="text-gray-300">{{
                    analyticsData.events.source
                  }}</span>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
              <div class="bg-gray-900 border border-gray-700 rounded-lg p-3">
                <div class="text-xs text-gray-400 mb-2">{{ $t("auto.k_892e2237") }}</div>
                <div
                  v-if="!analyticsData.events.events_by_day?.length"
                  class="text-xs text-gray-500"
                > {{ $t("auto.k_79db7a01") }} </div>
                <div v-else class="overflow-x-auto">
                  <table class="min-w-full text-sm">
                    <thead>
                      <tr
                        class="text-xs text-gray-400 border-b border-gray-800"
                      >
                        <th class="text-left py-2 pr-4">Day</th>
                        <th class="text-right py-2">Events</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="row in analyticsData.events.events_by_day"
                        :key="row.day"
                        class="border-b border-gray-800"
                      >
                        <td class="py-2 pr-4 text-gray-200">{{ row.day }}</td>
                        <td class="py-2 text-right text-gray-200">
                          {{ row.events }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div class="bg-gray-900 border border-gray-700 rounded-lg p-3">
                <div class="text-xs text-gray-400 mb-2">{{ $t("auto.k_a7812064") }}</div>
                <div
                  v-if="!analyticsData.events.top_venues?.length"
                  class="text-xs text-gray-500"
                > {{ $t("auto.k_79db7a01") }} </div>
                <div v-else class="overflow-x-auto">
                  <table class="min-w-full text-sm">
                    <thead>
                      <tr
                        class="text-xs text-gray-400 border-b border-gray-800"
                      >
                        <th class="text-left py-2 pr-4">Venue</th>
                        <th class="text-right py-2 pr-4">Events</th>
                        <th class="text-right py-2">Unique</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="row in analyticsData.events.top_venues"
                        :key="row.venue_ref"
                        class="border-b border-gray-800"
                      >
                        <td class="py-2 pr-4 text-gray-200">
                          <a
                            :href="
                              row.venue_ref?.startsWith('/')
                                ? row.venue_ref
                                : `/venue/${encodeURIComponent(row.venue_ref)}`
                            "
                            target="_blank"
                            rel="noopener noreferrer"
                            class="underline decoration-white/20 hover:decoration-white/60"
                          >
                            {{ row.venue_name || row.venue_ref }}
                          </a>
                        </td>
                        <td class="py-2 pr-4 text-right text-gray-200">
                          {{ row.events }}
                        </td>
                        <td class="py-2 text-right text-gray-200">
                          {{ row.unique_visitors || 0 }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <div class="bg-gray-900 border border-gray-700 rounded-lg p-3">
                <div class="flex items-center justify-between gap-2">
                  <div class="text-xs text-gray-400">{{ $t("auto.k_3bf13f14") }}</div>
                  <div class="text-[11px] text-gray-500"> {{ $t("auto.k_d2fb054b") }} </div>
                </div>
                <div
                  v-if="!analyticsData.events.top_pages?.length"
                  class="text-xs text-gray-500 mt-3"
                > {{ $t("auto.k_79db7a01") }} </div>
                <div v-else class="overflow-x-auto mt-3">
                  <table class="min-w-full text-sm">
                    <thead>
                      <tr
                        class="text-xs text-gray-400 border-b border-gray-800"
                      >
                        <th class="text-left py-2 pr-4">Path</th>
                        <th class="text-right py-2 pr-4">Views</th>
                        <th class="text-right py-2">Unique</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="row in analyticsData.events.top_pages"
                        :key="row.path"
                        class="border-b border-gray-800"
                      >
                        <td class="py-2 pr-4 text-gray-200 font-mono text-xs">
                          <a
                            :href="row.path"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="underline decoration-white/20 hover:decoration-white/60"
                          >
                            {{ row.path }}
                          </a>
                        </td>
                        <td class="py-2 pr-4 text-right text-gray-200">
                          {{ row.events }}
                        </td>
                        <td class="py-2 text-right text-gray-200">
                          {{ row.unique_visitors || 0 }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div class="bg-gray-900 border border-gray-700 rounded-lg p-3">
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <div class="text-xs text-gray-400">Funnel</div>
                    <div class="text-[11px] text-gray-500"> {{ $t("auto.k_d9c7ca66") }} <span class="text-gray-300">{{
                        analyticsData.funnel?.source || "none"
                      }}</span>
                      <span
                        v-if="analyticsData.funnel?.truncated"
                        class="text-yellow-300 ml-2"
                        >truncated</span
                      >
                    </div>
                  </div>
                </div>

                <div
                  v-if="!analyticsData.funnel?.steps?.length"
                  class="text-xs text-gray-500 mt-3"
                > {{ $t("auto.k_79db7a01") }} </div>

                <div v-else class="mt-3 space-y-3">
                  <div class="space-y-1">
                    <div
                      v-for="step in analyticsData.funnel.steps"
                      :key="step.step"
                      class="flex items-center justify-between gap-2 text-xs"
                    >
                      <span class="text-gray-300 font-mono">{{
                        step.step
                      }}</span>
                      <span class="text-gray-200 font-bold">{{
                        step.unique_visitors
                      }}</span>
                    </div>
                  </div>

                  <div
                    v-if="analyticsData.funnel.intersections?.length"
                    class="pt-2 border-t border-gray-800"
                  >
                    <div class="text-[11px] text-gray-500 mb-2"> {{ $t("auto.k_713080dd") }} </div>
                    <div
                      v-for="edge in analyticsData.funnel.intersections"
                      :key="`${edge.from}:${edge.to}`"
                      class="flex items-center justify-between gap-2 text-xs"
                    >
                      <span class="text-gray-300 font-mono"
                        >{{ edge.from }} → {{ edge.to }}</span
                      >
                      <span class="text-gray-200">{{
                        formatPercent(edge.conversion_rate)
                      }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="mt-4 bg-gray-900 border border-gray-700 rounded-lg p-3">
              <div class="flex items-center justify-between gap-2">
                <div class="text-xs text-gray-400">{{ $t("auto.k_89c97b8f") }}</div>
                <div class="text-[11px] text-gray-500"> {{ $t("auto.k_cd0cda6") }} {{ analyticsData.retention?.horizon_days || 0 }}d
                </div>
              </div>

              <div
                v-if="!analyticsData.retention?.cohorts?.length"
                class="text-xs text-gray-500 mt-3"
              > {{ $t("auto.k_79db7a01") }} </div>

              <div v-else class="overflow-x-auto mt-3">
                <table class="min-w-full text-sm">
                  <thead>
                    <tr class="text-xs text-gray-400 border-b border-gray-800">
                      <th class="text-left py-2 pr-4">{{ $t("auto.k_37337bc2") }}</th>
                      <th class="text-right py-2 pr-4">Size</th>
                      <th class="text-right py-2 pr-4">D1</th>
                      <th class="text-right py-2 pr-4">D3</th>
                      <th class="text-right py-2">D7</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="cohort in analyticsData.retention.cohorts"
                      :key="cohort.cohort_day"
                      class="border-b border-gray-800"
                    >
                      <td class="py-2 pr-4 text-gray-200 font-mono text-xs">
                        {{ cohort.cohort_day }}
                      </td>
                      <td class="py-2 pr-4 text-right text-gray-200">
                        {{ cohort.size }}
                      </td>
                      <td class="py-2 pr-4 text-right text-gray-200">
                        {{ formatPercent(getRetentionRate(cohort, 1)) }}
                      </td>
                      <td class="py-2 pr-4 text-right text-gray-200">
                        {{ formatPercent(getRetentionRate(cohort, 3)) }}
                      </td>
                      <td class="py-2 text-right text-gray-200">
                        {{ formatPercent(getRetentionRate(cohort, 7)) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="text-gray-400"> {{ $t("auto.k_c54365b1") }} <button
            type="button"
            class="ml-1 rounded-lg border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800 transition-colors"
            @click="fetchAnalytics"
          >
            Refresh
          </button>
          .
        </div>
      </div>

      <!-- PII Audit -->
      <div v-if="activeTab === 'pii'" class="mt-6">
        <div
          class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4"
        >
          <div>
            <h2 class="text-xl font-semibold">{{ $t("auto.k_691e7504") }}</h2>
            <p class="text-sm text-gray-400"> {{ $t("auto.k_c03950d4") }} </p>
          </div>
          <div class="flex flex-col sm:flex-row gap-2">
            <button
              @click="fetchPiiAudit"
              class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded transition-colors duration-150"
            >
              Refresh
            </button>
            <button
              @click="exportPiiAudit"
              :disabled="piiLoading || piiData?.setup_required"
              class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded transition-colors duration-150"
            > {{ $t("auto.k_1f58f993") }} </button>
            <button
              @click="exportPiiAccessLog"
              :disabled="piiLoading || piiData?.setup_required"
              class="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded transition-colors duration-150"
            > {{ $t("auto.k_e4fa0001") }} </button>
          </div>
        </div>

        <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label class="text-xs text-gray-400"> {{ $t("auto.k_226aea58") }} <select
                v-model.number="piiDays"
                class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option :value="7">{{ $t("auto.k_35b9d98f") }}</option>
                <option :value="14">{{ $t("auto.k_cfbe0421") }}</option>
                <option :value="30">{{ $t("auto.k_d0778b33") }}</option>
              </select>
            </label>

            <label class="text-xs text-gray-400"> {{ $t("auto.k_b0448941") }} <input :aria-label="$t('a11y.input_field')"
                v-model="piiCountry"
                placeholder="TH"
                maxlength="8"
                class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>

            <label class="text-xs text-gray-400"> {{ $t("auto.k_e30a933b") }} <input :aria-label="$t('a11y.input_field')"
                v-model="piiPin"
                type="password"
                :placeholder="$t('auto.k_a394ab3e')"
                maxlength="128"
                autocomplete="off"
                class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
          </div>

          <div class="mt-3 text-xs text-yellow-300"> {{ $t("auto.k_3e1b1742") }} </div>
        </div>

        <div v-if="piiError" class="bg-red-500 text-white p-3 rounded mb-4">
          {{ piiError }}
        </div>

        <div v-if="piiLoading" class="text-center py-8 text-gray-400"> {{ $t("auto.k_bfbc4638") }} </div>

        <div v-else-if="piiData" class="space-y-4">
          <div
            v-if="piiData.setup_required"
            class="rounded-xl border border-yellow-500/40 bg-yellow-950/30 p-3 text-sm text-yellow-200"
          >
            {{ piiData.setup_message || "PII audit setup is required." }}
          </div>

          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
              <div class="text-xs text-gray-400">Sessions</div>
              <div class="text-lg font-bold">
                {{ piiData.kpis.sessions_total }}
              </div>
            </div>
            <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
              <div class="text-xs text-gray-400">{{ $t("auto.k_de0efc79") }}</div>
              <div class="text-lg font-bold">
                {{ piiData.kpis.unique_visitors_total }}
              </div>
            </div>
            <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
              <div class="text-xs text-gray-400">{{ $t("auto.k_cb3e9c5b") }}</div>
              <div class="text-lg font-bold">
                {{ piiData.kpis.live_visitors_15m }}
              </div>
            </div>
            <div
              class="bg-gray-800 border border-gray-700 rounded-lg p-3 md:col-span-3"
            >
              <div class="text-xs text-gray-400">Range</div>
              <div class="text-sm text-gray-200 font-mono">
                {{ piiData.range.from }} → {{ piiData.range.to }}
                <span v-if="piiData.request_id" class="text-gray-500 ml-2"
                  >({{ piiData.request_id }})</span
                >
              </div>
            </div>
          </div>

          <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-sm font-semibold">{{ $t("auto.k_ddec9fb5") }}</h3>
              <div class="text-xs text-gray-500">
                {{ piiData.access_report?.rows_fetched || 0 }} rows
              </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <div class="bg-gray-900 border border-gray-700 rounded-lg p-3">
                <div class="text-xs text-gray-400">Views</div>
                <div class="text-lg font-bold">
                  {{ piiData.access_report?.totals?.views ?? 0 }}
                </div>
              </div>
              <div class="bg-gray-900 border border-gray-700 rounded-lg p-3">
                <div class="text-xs text-gray-400">Exports</div>
                <div class="text-lg font-bold">
                  {{ piiData.access_report?.totals?.exports ?? 0 }}
                </div>
              </div>
              <div class="bg-gray-900 border border-gray-700 rounded-lg p-3">
                <div class="text-xs text-gray-400">{{ $t("auto.k_14ebebca") }}</div>
                <div class="text-lg font-bold">
                  {{ piiData.access_report?.totals?.actions ?? 0 }}
                </div>
              </div>
              <div class="bg-gray-900 border border-gray-700 rounded-lg p-3">
                <div class="text-xs text-gray-400">Truncated</div>
                <div class="text-lg font-bold">
                  {{ piiData.access_report?.truncated ? "yes" : "no" }}
                </div>
              </div>
            </div>

            <div class="overflow-x-auto mt-4">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="text-xs text-gray-400 border-b border-gray-700">
                    <th class="text-left py-2 pr-4">Actor</th>
                    <th class="text-left py-2 pr-4">Email</th>
                    <th class="text-right py-2 pr-4">Views</th>
                    <th class="text-right py-2 pr-4">Exports</th>
                    <th class="text-right py-2 pr-4">Total</th>
                    <th class="text-left py-2">{{ $t("auto.k_bb68a138") }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in piiData.access_report?.top_viewers || []"
                    :key="row.actor_user_id"
                    class="border-b border-gray-800"
                  >
                    <td class="py-2 pr-4 text-gray-200 font-mono text-xs">
                      {{ row.actor_user_id || "N/A" }}
                    </td>
                    <td class="py-2 pr-4 text-gray-200 text-xs">
                      {{ row.email || "N/A" }}
                    </td>
                    <td class="py-2 pr-4 text-right text-gray-200">
                      {{ row.views || 0 }}
                    </td>
                    <td class="py-2 pr-4 text-right text-gray-200">
                      {{ row.exports || 0 }}
                    </td>
                    <td class="py-2 pr-4 text-right text-gray-200">
                      {{ row.actions || 0 }}
                    </td>
                    <td class="py-2 text-gray-200 text-xs">
                      {{ formatDate(row.last_seen_at) }}
                    </td>
                  </tr>
                  <tr v-if="!piiData.access_report?.top_viewers?.length">
                    <td colspan="6" class="py-3 text-xs text-gray-500"> {{ $t("auto.k_9e4e9985") }} </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div class="flex items-center justify-between gap-2">
                <h3 class="text-sm font-semibold">{{ $t("auto.k_2cc3afae") }}</h3>
                <div class="text-xs text-gray-500">{{ $t("auto.k_ba99e466") }}</div>
              </div>
              <div class="overflow-x-auto mt-3">
                <table class="min-w-full text-sm">
                  <thead>
                    <tr class="text-xs text-gray-400 border-b border-gray-700">
                      <th class="text-left py-2 pr-4">Country</th>
                      <th class="text-right py-2 pr-4">Sessions</th>
                      <th class="text-right py-2">Unique</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in piiData.top_countries"
                      :key="row.country"
                      class="border-b border-gray-800"
                    >
                      <td class="py-2 pr-4 text-gray-200">
                        {{ row.country || "N/A" }}
                      </td>
                      <td class="py-2 pr-4 text-right text-gray-200">
                        {{ row.sessions }}
                      </td>
                      <td class="py-2 text-right text-gray-200">
                        {{ row.unique_visitors }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div class="flex items-center justify-between gap-2">
                <h3 class="text-sm font-semibold">{{ $t("auto.k_23dce5f7") }}</h3>
                <div class="text-xs text-gray-500">
                  {{ piiData.recent_sessions?.length || 0 }} rows
                </div>
              </div>

              <div
                v-if="!piiData.recent_sessions?.length"
                class="text-xs text-gray-500 mt-3"
              > {{ $t("auto.k_79db7a01") }} </div>

              <div v-else class="overflow-x-auto mt-3">
                <table class="min-w-full text-sm">
                  <thead>
                    <tr class="text-xs text-gray-400 border-b border-gray-700">
                      <th class="text-left py-2 pr-4">Seen</th>
                      <th class="text-left py-2 pr-4">Visitor</th>
                      <th class="text-left py-2 pr-4">User</th>
                      <th class="text-left py-2 pr-4">IP</th>
                      <th class="text-left py-2 pr-4">Country</th>
                      <th class="text-left py-2 pr-4">City</th>
                      <th class="text-left py-2">UA</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(row, idx) in piiData.recent_sessions"
                      :key="`${row.visitor_id || 'v'}:${idx}`"
                      class="border-b border-gray-800"
                    >
                      <td class="py-2 pr-4 text-gray-200">
                        {{ formatDate(row.last_seen_at) }}
                      </td>
                      <td class="py-2 pr-4 text-gray-200 font-mono text-xs">
                        {{ row.visitor_id || "N/A" }}
                      </td>
                      <td class="py-2 pr-4 text-gray-200 font-mono text-xs">
                        {{ row.user_id || "N/A" }}
                      </td>
                      <td class="py-2 pr-4 text-gray-200 font-mono text-xs">
                        {{ row.ip_raw || "N/A" }}
                      </td>
                      <td class="py-2 pr-4 text-gray-200">
                        {{ row.country || "N/A" }}
                      </td>
                      <td class="py-2 pr-4 text-gray-200">
                        {{ row.city || "N/A" }}
                      </td>
                      <td class="py-2 text-gray-200 text-xs">
                        {{ String(row.user_agent || "N/A").slice(0, 80) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="text-gray-400"> {{ $t("auto.k_de392aa0") }} <span class="text-gray-200">Refresh</span>.
        </div>
      </div>

      <!-- 📍 Local Ads Management -->
      <div v-if="activeTab === 'ads'">
        <LocalAdManager />
      </div>

      <!-- 🟢 Online Now KPI (floating badge) -->
      <div
        v-if="isConnected"
        class="fixed bottom-4 right-4 z-40 flex items-center gap-2 bg-gray-800/90 backdrop-blur border border-gray-700 rounded-full px-3 py-1.5 text-xs font-semibold text-gray-200 shadow-lg"
      >
        <span class="relative flex h-2 w-2">
          <span
            class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"
          ></span>
          <span
            class="relative inline-flex rounded-full h-2 w-2 bg-green-500"
          ></span>
        </span>
        {{ onlineCount }} online
      </div>

      <!-- Promote Modal -->
      <div
        v-if="promoteModal.isOpen"
        class="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
      >
        <div
          class="bg-gray-800 p-6 rounded-lg max-w-md w-full border border-gray-700"
        >
          <h3 class="text-xl font-bold mb-4">{{ $t("auto.k_f8b552ef") }}</h3>

          <div class="space-y-4">
            <div>
              <label class="block text-sm text-gray-400 mb-1">Category</label>
              <select
                v-model="promoteModal.category"
                class="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
              >
                <option value="shopping_mall">{{ $t("auto.k_43d684cd") }}</option>
                <option value="night_market">{{ $t("auto.k_52f81e37") }}</option>
                <option value="transport_hub">{{ $t("auto.k_19e6c0ad") }}</option>
                <option value="stadium">Stadium</option>
                <option value="landmark">Landmark</option>
              </select>
            </div>

            <div>
              <label class="block text-sm text-gray-400 mb-1"
                >{{ $t("auto.k_2c018651") }}{{ promoteModal.scale }})</label
              >
              <input :aria-label="$t('a11y.input_field')"
                type="range"
                min="1"
                max="2"
                step="0.1"
                v-model.number="promoteModal.scale"
                class="w-full"
              />
            </div>

            <div>
              <label class="block text-sm text-gray-400 mb-1">{{ $t("auto.k_54b47ebb") }}</label>
              <input :aria-label="$t('a11y.input_field')"
                type="color"
                v-model="promoteModal.color"
                class="w-full h-10 bg-transparent cursor-pointer"
              />
            </div>

            <div>
              <label class="block text-sm text-gray-400 mb-1"
                >{{ $t("auto.k_ea2b4b12") }}</label
              >
              <input :aria-label="$t('a11y.input_field')"
                type="number"
                v-model.number="promoteModal.rank"
                class="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
              />
            </div>
          </div>

          <div class="flex justify-end gap-3 mt-6">
            <button
              @click="promoteModal.isOpen = false"
              class="px-4 py-2 text-gray-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              @click="confirmPromote"
              :disabled="isPendingReviewAction(promoteModal.shopId)"
              class="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white px-4 py-2 rounded font-bold"
            > {{ $t("auto.k_cb7f1093") }} </button>
          </div>
        </div>
      </div>

      <!-- ═══ DATA DASHBOARD TABS ═══ -->
      <div v-if="activeTab === 'data-overview'" class="mt-6">
        <AdminOverviewTab />
      </div>
      <div v-if="activeTab === 'data-venues'" class="mt-6">
        <AdminVenuesTab />
      </div>
      <div v-if="activeTab === 'data-visitors'" class="mt-6">
        <AdminVisitorsTab />
      </div>
      <div v-if="activeTab === 'data-gamification'" class="mt-6">
        <AdminGamificationTab />
      </div>
      <div v-if="activeTab === 'data-orders'" class="mt-6">
        <AdminOrdersTab />
      </div>
      <div v-if="activeTab === 'data-ads'" class="mt-6"><AdminAdsTab /></div>
      <div v-if="activeTab === 'data-reviews'" class="mt-6">
        <AdminReviewsTab />
      </div>
      <div v-if="activeTab === 'data-users'" class="mt-6">
        <AdminUsersTab />
      </div>
    </div>
  </div>
</template>

<script setup>
import { useHead } from "@unhead/vue";
import { computed, defineAsyncComponent, onMounted, ref, watch } from "vue";
import { useNotifications } from "@/composables/useNotifications";
import {
	cloneOptimisticValue,
	runCommitMutation,
	runOptimisticMutation,
} from "@/composables/useOptimisticUpdate";
import { usePresence } from "@/composables/usePresence";
import i18n from "@/i18n.js";
import { adminAnalyticsService } from "../services/adminAnalyticsService";
import { adminPiiAuditService } from "../services/adminPiiAuditService";
import { adminService } from "../services/adminService";
import { useUserStore } from "../store/userStore";

const LocalAdManager = defineAsyncComponent(
	() => import("../components/admin/LocalAdManager.vue"),
);
const AdminOverviewTab = defineAsyncComponent(
	() => import("../components/admin/AdminOverview.vue"),
);
const AdminVenuesTab = defineAsyncComponent(
	() => import("../components/admin/AdminVenues.vue"),
);
const AdminVisitorsTab = defineAsyncComponent(
	() => import("../components/admin/AdminVisitors.vue"),
);
const AdminGamificationTab = defineAsyncComponent(
	() => import("../components/admin/AdminGamification.vue"),
);
const AdminOrdersTab = defineAsyncComponent(
	() => import("../components/admin/AdminOrders.vue"),
);
const AdminAdsTab = defineAsyncComponent(
	() => import("../components/admin/AdminAds.vue"),
);
const AdminReviewsTab = defineAsyncComponent(
	() => import("../components/admin/AdminReviews.vue"),
);
const AdminUsersTab = defineAsyncComponent(
	() => import("../components/admin/AdminUsers.vue"),
);

const userStore = useUserStore();

const pendingShops = ref([]);
const loading = ref(true);
const error = ref(null);
const pendingLoaded = ref(false);
const pendingReviewActionIds = ref(new Set());
const bulkPendingAction = ref("");
const selectedPendingShopIds = ref(new Set());
const adminAuthEmail = ref("");
const adminAuthPassword = ref("");
const adminAuthLoading = ref(false);
const adminAuthMessage = ref("");
const adminAuthMessageType = ref("info");

const activeTab = ref("data-overview");
const ADMIN_TABS = [
	"review",
	"slips",
	"usage",
	"pii",
	"ads",
	"data-overview",
	"data-venues",
	"data-visitors",
	"data-gamification",
	"data-orders",
	"data-ads",
	"data-reviews",
	"data-users",
];

const dataTabs = [
	{ id: "data-overview", label: "Overview", icon: "📊" },
	{ id: "data-venues", label: "Venues", icon: "📍" },
	{ id: "data-visitors", label: "Visitors", icon: "👥" },
	{ id: "data-gamification", label: "Gamification", icon: "🪙" },
	{ id: "data-orders", label: "Orders", icon: "🛒" },
	{ id: "data-ads", label: "Ads", icon: "📢" },
	{ id: "data-reviews", label: "Reviews", icon: "⭐" },
	{ id: "data-users", label: "Users", icon: "🧑‍💻" },
];

const setActiveTab = (tab) => {
	if (!ADMIN_TABS.includes(tab)) return;
	activeTab.value = tab;
};

const handleTabKeydown = (event) => {
	if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
	const currentIndex = ADMIN_TABS.indexOf(activeTab.value);
	if (currentIndex < 0) return;
	event.preventDefault();

	let nextIndex = currentIndex;
	if (event.key === "ArrowRight") {
		nextIndex = (currentIndex + 1) % ADMIN_TABS.length;
	} else if (event.key === "ArrowLeft") {
		nextIndex = (currentIndex - 1 + ADMIN_TABS.length) % ADMIN_TABS.length;
	} else if (event.key === "Home") {
		nextIndex = 0;
	} else if (event.key === "End") {
		nextIndex = ADMIN_TABS.length - 1;
	}

	const nextTab = ADMIN_TABS[nextIndex];
	setActiveTab(nextTab);
	requestAnimationFrame(() => {
		document
			.querySelector(`[data-tab="${nextTab}"]`)
			?.focus?.({ preventScroll: true });
	});
};

const { onlineCount, isConnected } = usePresence();

const slipLogs = ref([]);
const slipLoading = ref(false);
const slipError = ref(null);
const slipsLoaded = ref(false);
const slipStatus = ref("all");
const slipSearch = ref("");
const slipBuyerName = ref("");
const slipBuyerEmail = ref("");
const slipExportGroup = ref("none");
const slipExportGroupLabel = computed(() =>
	slipExportGroup.value === "status"
		? "status"
		: slipExportGroup.value === "date"
			? "date"
			: "single CSV",
);
const slipLimit = ref(50);
const slipPage = ref(1);
const slipTotal = ref(0);
const slipSummary = ref({
	total: 0,
	paid: 0,
	rejected: 0,
	pending: 0,
});

const slipTotalPages = computed(() => {
	return Math.max(1, Math.ceil(slipTotal.value / slipLimit.value));
});
const { notify, notifySuccess } = useNotifications();

const normalizePendingShopId = (shopId) => String(shopId || "").trim();
const adminUiText = (en, th) =>
	String(i18n.global.locale?.value || i18n.global.locale || "en")
		.toLowerCase()
		.startsWith("th")
		? th
		: en;

const setPendingReviewAction = (shopId, isPending) => {
	const next = new Set(pendingReviewActionIds.value);
	const key = normalizePendingShopId(shopId);
	if (!key) return;
	if (isPending) next.add(key);
	else next.delete(key);
	pendingReviewActionIds.value = next;
};

const setPendingReviewActionMany = (shopIds, isPending) => {
	const next = new Set(pendingReviewActionIds.value);
	for (const shopId of shopIds) {
		const key = normalizePendingShopId(shopId);
		if (!key) continue;
		if (isPending) next.add(key);
		else next.delete(key);
	}
	pendingReviewActionIds.value = next;
};

const isPendingReviewAction = (shopId) =>
	pendingReviewActionIds.value.has(normalizePendingShopId(shopId));

const syncPendingSelection = () => {
	const allowed = new Set(
		pendingShops.value
			.map((shop) => normalizePendingShopId(shop.id))
			.filter(Boolean),
	);
	selectedPendingShopIds.value = new Set(
		[...selectedPendingShopIds.value].filter((shopId) => allowed.has(shopId)),
	);
};

const selectedPendingIds = computed(() =>
	pendingShops.value
		.map((shop) => shop.id)
		.filter((shopId) =>
			selectedPendingShopIds.value.has(normalizePendingShopId(shopId)),
		),
);
const selectedPendingCount = computed(() => selectedPendingIds.value.length);
const allPendingSelected = computed(
	() =>
		pendingShops.value.length > 0 &&
		selectedPendingCount.value === pendingShops.value.length,
);
const isBulkModerating = computed(() => Boolean(bulkPendingAction.value));
const bulkPendingLabel = computed(() => {
	if (bulkPendingAction.value === "approve") {
		return adminUiText("Approving selected shops...", "กำลังอนุมัติร้านที่เลือก...");
	}
	if (bulkPendingAction.value === "reject") {
		return adminUiText("Rejecting selected shops...", "กำลังปฏิเสธร้านที่เลือก...");
	}
	return "";
});
const pendingSelectionSummary = computed(() =>
	selectedPendingCount.value > 0
		? adminUiText(
				`${selectedPendingCount.value} shops selected for moderation.`,
				`เลือกร้านไว้สำหรับตรวจสอบ ${selectedPendingCount.value} รายการ`,
			)
		: adminUiText(
				"Choose one or more shops to use bulk moderation.",
				"เลือกร้านอย่างน้อยหนึ่งรายการเพื่อใช้การตรวจสอบแบบหลายรายการ",
			),
);
const isPendingShopSelected = (shopId) =>
	selectedPendingShopIds.value.has(normalizePendingShopId(shopId));
const clearPendingShopSelection = (shopIds) => {
	const keys = new Set(
		(shopIds || [])
			.map((shopId) => normalizePendingShopId(shopId))
			.filter(Boolean),
	);
	if (keys.size === 0) return;
	selectedPendingShopIds.value = new Set(
		[...selectedPendingShopIds.value].filter((shopId) => !keys.has(shopId)),
	);
};
const togglePendingShopSelection = (shopId) => {
	if (isBulkModerating.value) return;
	const key = normalizePendingShopId(shopId);
	if (!key) return;
	const next = new Set(selectedPendingShopIds.value);
	if (next.has(key)) next.delete(key);
	else next.add(key);
	selectedPendingShopIds.value = next;
};
const toggleAllPendingSelections = () => {
	if (isBulkModerating.value) return;
	if (allPendingSelected.value) {
		selectedPendingShopIds.value = new Set();
		return;
	}
	selectedPendingShopIds.value = new Set(
		pendingShops.value
			.map((shop) => normalizePendingShopId(shop.id))
			.filter(Boolean),
	);
};

const analyticsLoading = ref(false);
const analyticsError = ref(null);
const analyticsDays = ref(7);
const analyticsCountry = ref("");
const analyticsEventType = ref("");
const analyticsData = ref(null);

const piiLoading = ref(false);
const piiError = ref(null);
const piiDays = ref(7);
const piiCountry = ref("");
const piiPin = ref("");
const piiData = ref(null);
const sheetSyncLoading = ref(false);
const sheetSyncMessage = ref("");
const sheetSyncError = ref("");
const sheetSyncStats = ref(null);

const trackAdminError = (context, e) => {
	const message = String(e?.message || e || "unknown");
	void import("../services/analyticsService")
		.then(({ analyticsService }) =>
			analyticsService.trackEvent("admin_error", {
				context,
				message: message.slice(0, 300),
			}),
		)
		.catch(() => {});
};

useHead(() => ({
	title: "Admin - VibeCity",
	meta: [{ name: "robots", content: "noindex,nofollow" }],
}));

const fetchPending = async () => {
	loading.value = true;
	error.value = null;
	try {
		const res = await adminService.listPendingShops();
		// API returns { success: true, data: [...] }
		pendingShops.value = res.data || [];
		syncPendingSelection();
	} catch (e) {
		error.value = e.message;
		trackAdminError("pending_shops_fetch", e);
	} finally {
		loading.value = false;
		pendingLoaded.value = true;
	}
};

const handleAdminSignIn = async () => {
	adminAuthLoading.value = true;
	adminAuthMessage.value = "";
	adminAuthMessageType.value = "info";
	try {
		if (!adminAuthEmail.value || !adminAuthPassword.value) {
			throw new Error(i18n.global.t("auto.k_48f7f7de"));
		}
		await userStore.loginWithPassword({
			email: adminAuthEmail.value,
			password: adminAuthPassword.value,
		});
		await userStore.refreshAuth?.();
		if (!userStore.isAdmin) {
			throw new Error(i18n.global.t("auto.k_5c3241f8"));
		}
		adminAuthMessage.value = "Sign in สำเร็จ";
		adminAuthMessageType.value = "success";
		adminAuthPassword.value = "";
		await fetchPending();
	} catch (e) {
		adminAuthMessage.value = String(e?.message || "Sign in failed");
		adminAuthMessageType.value = "error";
	} finally {
		adminAuthLoading.value = false;
	}
};

const sendAdminMagicLink = async () => {
	adminAuthLoading.value = true;
	adminAuthMessage.value = "";
	adminAuthMessageType.value = "info";
	try {
		if (!adminAuthEmail.value) {
			throw new Error(i18n.global.t("auto.k_3644f56a"));
		}
		await userStore.sendAdminMagicLink(adminAuthEmail.value);
		adminAuthMessage.value = "ส่ง magic link แล้ว กรุณาเช็กอีเมลและกลับเข้ามาที่ /admin";
		adminAuthMessageType.value = "success";
	} catch (e) {
		const rawMessage = String(e?.message || "Send magic link failed");
		if (rawMessage.toLowerCase().includes("error sending magic link email")) {
			adminAuthMessage.value = `Supabase ส่งเมลไม่ได้ (SMTP ผิดพลาด). ใช้รหัสผ่านแทน หรือรัน: node scripts/generate-admin-magic-link.cjs ${adminAuthEmail.value} http://localhost:5173/admin`;
		} else {
			adminAuthMessage.value = rawMessage;
		}
		adminAuthMessageType.value = "error";
	} finally {
		adminAuthLoading.value = false;
	}
};

const runSheetSync = async () => {
	sheetSyncLoading.value = true;
	sheetSyncError.value = "";
	sheetSyncMessage.value = "";
	try {
		await runCommitMutation({
			commit: () =>
				adminService.runSheetSync({
					mode: "incremental",
					scope: "all",
				}),
			onSuccess: (payload) => {
				sheetSyncStats.value = payload?.stats || null;
				sheetSyncMessage.value = `Sync complete (run_id: ${payload?.run_id || "n/a"})`;
			},
			onError: (error) => {
				sheetSyncError.value = String(error?.message || "Sheet sync failed");
			},
			errorMessage: (error) => String(error?.message || "Sheet sync failed"),
		});
	} finally {
		sheetSyncLoading.value = false;
	}
};

const computeSlipSummary = (items) => {
	const summary = {
		total: slipTotal.value || items.length,
		paid: 0,
		rejected: 0,
		pending: 0,
	};
	items.forEach((item) => {
		const status = (item.status || "").toLowerCase();
		if (status === "paid") summary.paid += 1;
		else if (status === "rejected") summary.rejected += 1;
		else summary.pending += 1;
	});
	slipSummary.value = summary;
};

const fetchSlipLogs = async () => {
	slipLoading.value = true;
	slipError.value = null;
	try {
		const offset = (slipPage.value - 1) * slipLimit.value;
		const res = await adminService.listSlipVerifications({
			status: slipStatus.value,
			search: slipSearch.value,
			buyer_name: slipBuyerName.value,
			buyer_email: slipBuyerEmail.value,
			limit: slipLimit.value,
			offset,
		});
		slipLogs.value = res.data || [];
		slipTotal.value = res.count || 0;
		computeSlipSummary(slipLogs.value);
	} catch (e) {
		slipError.value = e.message;
		trackAdminError("slip_logs_fetch", e);
	} finally {
		slipLoading.value = false;
		slipsLoaded.value = true;
	}
};

const prevSlipPage = () => {
	if (slipPage.value > 1) {
		slipPage.value -= 1;
		fetchSlipLogs();
	}
};

const nextSlipPage = () => {
	if (slipPage.value < slipTotalPages.value) {
		slipPage.value += 1;
		fetchSlipLogs();
	}
};

const downloadCsv = (blob, filename) => {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
};

const exportSlipLogs = async (mode) => {
	try {
		const offset = (slipPage.value - 1) * slipLimit.value;
		const blob = await adminService.exportSlipVerifications({
			status: slipStatus.value,
			search: slipSearch.value,
			buyer_name: slipBuyerName.value,
			buyer_email: slipBuyerEmail.value,
			limit: slipLimit.value,
			offset,
			mode: mode === "zip" ? "all" : mode,
			zip_by:
				mode === "zip" && slipExportGroup.value !== "none"
					? slipExportGroup.value
					: undefined,
		});
		const filename =
			mode === "zip"
				? `slip-export-${slipExportGroup.value}-${new Date().toISOString()}.zip`
				: mode === "all"
					? `slip-export-all-${new Date().toISOString()}.csv`
					: `slip-export-page-${slipPage.value}-${new Date().toISOString()}.csv`;
		downloadCsv(blob, filename);
	} catch (e) {
		slipError.value = e.message;
	}
};

const fetchAnalytics = async () => {
	analyticsLoading.value = true;
	analyticsError.value = null;
	try {
		const payload = await adminAnalyticsService.getUsageDashboard({
			days: analyticsDays.value,
			country: analyticsCountry.value.trim() || undefined,
			event_type: analyticsEventType.value.trim() || undefined,
		});
		analyticsData.value = payload;
	} catch (e) {
		analyticsError.value = e.message;
		trackAdminError("analytics_fetch", e);
	} finally {
		analyticsLoading.value = false;
	}
};

const exportAnalytics = async () => {
	try {
		const blob = await adminAnalyticsService.exportUsage({
			days: analyticsDays.value,
			country: analyticsCountry.value.trim() || undefined,
			event_type: analyticsEventType.value.trim() || undefined,
		});
		const filename = `analytics-export-${new Date().toISOString()}.csv`;
		downloadCsv(blob, filename);
		notifySuccess("Exported analytics CSV.");
	} catch (e) {
		analyticsError.value = e.message;
		trackAdminError("analytics_export", e);
	}
};

const fetchPiiAudit = async () => {
	piiLoading.value = true;
	piiError.value = null;
	try {
		if (!piiPin.value.trim()) {
			throw new Error(i18n.global.t("auto.k_62444274"));
		}
		const payload = await adminPiiAuditService.getDashboard(
			{
				days: piiDays.value,
				country: piiCountry.value.trim() || undefined,
				recent_limit: 100,
			},
			piiPin.value.trim(),
		);
		piiData.value = payload;
	} catch (e) {
		piiError.value = e.message;
		trackAdminError("pii_audit_fetch", e);
	} finally {
		piiLoading.value = false;
	}
};

const exportPiiAudit = async () => {
	try {
		if (!piiPin.value.trim()) {
			throw new Error(i18n.global.t("auto.k_62444274"));
		}
		const blob = await adminPiiAuditService.exportCsv(
			{
				days: piiDays.value,
				country: piiCountry.value.trim() || undefined,
			},
			piiPin.value.trim(),
		);
		const filename = `pii-audit-export-${new Date().toISOString()}.csv`;
		downloadCsv(blob, filename);
		notifySuccess("Exported PII audit CSV.");
	} catch (e) {
		piiError.value = e.message;
		trackAdminError("pii_audit_export", e);
	}
};

const exportPiiAccessLog = async () => {
	try {
		if (!piiPin.value.trim()) {
			throw new Error(i18n.global.t("auto.k_62444274"));
		}
		const blob = await adminPiiAuditService.exportAccessLog(
			{
				days: piiDays.value,
				country: piiCountry.value.trim() || undefined,
			},
			piiPin.value.trim(),
		);
		const filename = `pii-access-log-${new Date().toISOString()}.csv`;
		downloadCsv(blob, filename);
		notifySuccess("Exported PII access log CSV.");
	} catch (e) {
		piiError.value = e.message;
	}
};

const handleApprove = async (id) => {
	if (!confirm(i18n.global.t("auto.k_9730be33"))) return;
	if (isPendingReviewAction(id) || isBulkModerating.value) return;

	setPendingReviewAction(id, true);
	try {
		await runOptimisticMutation({
			capture: () => ({
				shops: cloneOptimisticValue(pendingShops.value),
				selected: [...selectedPendingShopIds.value],
			}),
			applyOptimistic: (snapshot) => {
				pendingShops.value = (snapshot?.shops || []).filter(
					(shop) => shop.id !== id,
				);
				clearPendingShopSelection([id]);
			},
			rollback: (snapshot) => {
				pendingShops.value = snapshot?.shops || [];
				selectedPendingShopIds.value = new Set(snapshot?.selected || []);
			},
			commit: () => adminService.approveShop(id),
			onSuccess: () => {
				notifySuccess("Shop approved & rewards granted.");
			},
			notify,
			errorMessage: (error) =>
				`Error approving: ${error?.message || "Failed to approve shop"}`,
		});
	} finally {
		setPendingReviewAction(id, false);
	}
};

const handleReject = async (id) => {
	const reason = prompt("Reason for rejection:");
	if (reason === null) return;
	if (isPendingReviewAction(id) || isBulkModerating.value) return;

	setPendingReviewAction(id, true);
	try {
		await runOptimisticMutation({
			capture: () => ({
				shops: cloneOptimisticValue(pendingShops.value),
				selected: [...selectedPendingShopIds.value],
			}),
			applyOptimistic: (snapshot) => {
				pendingShops.value = (snapshot?.shops || []).filter(
					(shop) => shop.id !== id,
				);
				clearPendingShopSelection([id]);
			},
			rollback: (snapshot) => {
				pendingShops.value = snapshot?.shops || [];
				selectedPendingShopIds.value = new Set(snapshot?.selected || []);
			},
			commit: () => adminService.rejectShop(id, reason || "Policy violation"),
			onSuccess: () => {
				notifySuccess("Shop rejected.");
			},
			notify,
			errorMessage: (error) =>
				`Error rejecting: ${error?.message || "Failed to reject shop"}`,
		});
	} finally {
		setPendingReviewAction(id, false);
	}
};

const handleBulkApprove = async () => {
	const shopIds = [...selectedPendingIds.value];
	if (!shopIds.length || isBulkModerating.value) return;
	if (
		!confirm(
			adminUiText(
				`Approve ${shopIds.length} selected shops?`,
				`อนุมัติร้านที่เลือก ${shopIds.length} รายการใช่ไหม?`,
			),
		)
	)
		return;

	const selectedKeys = new Set(
		shopIds.map((shopId) => normalizePendingShopId(shopId)),
	);
	bulkPendingAction.value = "approve";
	setPendingReviewActionMany(shopIds, true);
	try {
		await runOptimisticMutation({
			capture: () => ({
				shops: cloneOptimisticValue(pendingShops.value),
				selected: [...selectedPendingShopIds.value],
			}),
			applyOptimistic: (snapshot) => {
				pendingShops.value = (snapshot?.shops || []).filter(
					(shop) => !selectedKeys.has(normalizePendingShopId(shop.id)),
				);
				selectedPendingShopIds.value = new Set(
					[...selectedPendingShopIds.value].filter(
						(shopId) => !selectedKeys.has(shopId),
					),
				);
			},
			rollback: (snapshot) => {
				pendingShops.value = snapshot?.shops || [];
				selectedPendingShopIds.value = new Set(snapshot?.selected || []);
			},
			commit: () => adminService.bulkApproveShops(shopIds),
			onSuccess: async (payload) => {
				const failedCount = Array.isArray(payload?.failed)
					? payload.failed.length
					: 0;
				if (failedCount > 0) {
					notify({
						type: "error",
						message: adminUiText(
							`${failedCount} selected shops still need review.`,
							`ยังมีร้านที่เลือก ${failedCount} รายการต้องตรวจต่อ`,
						),
					});
				}
				notifySuccess(
					failedCount > 0
						? adminUiText(
								`Approved ${shopIds.length - failedCount} shops. Refreshed remaining items.`,
								`อนุมัติแล้ว ${shopIds.length - failedCount} รายการ และรีเฟรชรายการที่เหลือแล้ว`,
							)
						: adminUiText(
								`Approved ${shopIds.length} shops.`,
								`อนุมัติแล้ว ${shopIds.length} รายการ`,
							),
				);
				await fetchPending();
			},
			notify,
			errorMessage: (error) =>
				adminUiText(
					`Error approving selected shops: ${error?.message || "Failed to approve shops"}`,
					`อนุมัติร้านที่เลือกไม่สำเร็จ: ${error?.message || "อนุมัติร้านไม่สำเร็จ"}`,
				),
		});
	} finally {
		setPendingReviewActionMany(shopIds, false);
		bulkPendingAction.value = "";
	}
};

const handleBulkReject = async () => {
	const shopIds = [...selectedPendingIds.value];
	if (!shopIds.length || isBulkModerating.value) return;
	const reason = prompt(
		adminUiText("Reason for rejection:", "เหตุผลในการปฏิเสธ:"),
	);
	if (reason === null) return;

	const selectedKeys = new Set(
		shopIds.map((shopId) => normalizePendingShopId(shopId)),
	);
	bulkPendingAction.value = "reject";
	setPendingReviewActionMany(shopIds, true);
	try {
		await runOptimisticMutation({
			capture: () => ({
				shops: cloneOptimisticValue(pendingShops.value),
				selected: [...selectedPendingShopIds.value],
			}),
			applyOptimistic: (snapshot) => {
				pendingShops.value = (snapshot?.shops || []).filter(
					(shop) => !selectedKeys.has(normalizePendingShopId(shop.id)),
				);
				selectedPendingShopIds.value = new Set(
					[...selectedPendingShopIds.value].filter(
						(shopId) => !selectedKeys.has(shopId),
					),
				);
			},
			rollback: (snapshot) => {
				pendingShops.value = snapshot?.shops || [];
				selectedPendingShopIds.value = new Set(snapshot?.selected || []);
			},
			commit: () =>
				adminService.bulkRejectShops(shopIds, reason || "Policy violation"),
			onSuccess: async (payload) => {
				const failedCount = Array.isArray(payload?.failed)
					? payload.failed.length
					: 0;
				if (failedCount > 0) {
					notify({
						type: "error",
						message: adminUiText(
							`${failedCount} selected shops still need review.`,
							`ยังมีร้านที่เลือก ${failedCount} รายการต้องตรวจต่อ`,
						),
					});
				}
				notifySuccess(
					failedCount > 0
						? adminUiText(
								`Rejected ${shopIds.length - failedCount} shops. Refreshed remaining items.`,
								`ปฏิเสธแล้ว ${shopIds.length - failedCount} รายการ และรีเฟรชรายการที่เหลือแล้ว`,
							)
						: adminUiText(
								`Rejected ${shopIds.length} shops.`,
								`ปฏิเสธแล้ว ${shopIds.length} รายการ`,
							),
				);
				await fetchPending();
			},
			notify,
			errorMessage: (error) =>
				adminUiText(
					`Error rejecting selected shops: ${error?.message || "Failed to reject shops"}`,
					`ปฏิเสธร้านที่เลือกไม่สำเร็จ: ${error?.message || "ปฏิเสธร้านไม่สำเร็จ"}`,
				),
		});
	} finally {
		setPendingReviewActionMany(shopIds, false);
		bulkPendingAction.value = "";
	}
};

const promoteModal = ref({
	isOpen: false,
	shopId: null,
	category: "shopping_mall",
	scale: 1.2,
	color: "#FFD700",
	rank: 10,
});

const openPromoteModal = (shopId) => {
	if (isBulkModerating.value) return;
	promoteModal.value.shopId = shopId;
	promoteModal.value.isOpen = true;
};

const confirmPromote = async () => {
	const { shopId, category, scale, color, rank } = promoteModal.value;
	if (!shopId || isPendingReviewAction(shopId)) return;

	setPendingReviewAction(shopId, true);
	try {
		await runCommitMutation({
			commit: () =>
				adminService.promoteToGiant(shopId, category, {
					model_scale: scale,
					glow_color: color,
					anchor_rank: rank,
				}),
			onSuccess: async () => {
				notifySuccess("Shop promoted to Giant successfully! 🌟");
				promoteModal.value.isOpen = false;
				await fetchPending();
			},
			notify,
			errorMessage: (error) =>
				`Error promoting: ${error?.message || "Failed to promote shop"}`,
		});
	} finally {
		setPendingReviewAction(shopId, false);
	}
};

const statusBadgeClass = (status) => {
	const s = (status || "").toLowerCase();
	if (s === "paid")
		return "bg-green-500/20 text-green-300 border border-green-500/30";
	if (s === "rejected")
		return "bg-red-500/20 text-red-300 border border-red-500/30";
	return "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30";
};

const formatDate = (value) => {
	if (!value) return "N/A";
	try {
		return new Date(value).toLocaleString();
	} catch {
		return "N/A";
	}
};

const formatAmount = (value) => {
	const amount = Number(value);
	if (Number.isNaN(amount)) return "0";
	return amount.toLocaleString();
};

const formatPercent = (value) => {
	const n = Number(value);
	if (!Number.isFinite(n)) return "0%";
	return `${(n * 100).toFixed(1)}%`;
};

const getRetentionRate = (cohort, offset) => {
	const rows = cohort?.by_day;
	if (!Array.isArray(rows)) return 0;
	const hit = rows.find((r) => r?.offset === offset);
	return hit?.rate ?? 0;
};

const getSlipMeta = (order) => {
	const meta = order?.metadata;
	if (!meta) return {};
	if (typeof meta === "string") {
		try {
			const parsed = JSON.parse(meta);
			return parsed?.slip_verification || {};
		} catch {
			return {};
		}
	}
	return meta?.slip_verification || {};
};

const getSlipAudit = (order) => {
	const audit = order?.slip_audit;
	if (Array.isArray(audit)) return audit[0] || {};
	return audit || {};
};

const formatMetadata = (metadata) => {
	if (!metadata) return "{}";
	if (typeof metadata === "string") return metadata;
	return JSON.stringify(metadata, null, 2);
};

onMounted(async () => {
	try {
		await userStore.initAuth?.();
	} catch {
		// ignore
	}

	if (!userStore.isAdmin) return;

	if (activeTab.value === "review" && !pendingLoaded.value) fetchPending();
	if (activeTab.value === "slips" && !slipsLoaded.value) fetchSlipLogs();
	if (activeTab.value === "usage" && !analyticsData.value) fetchAnalytics();
});

watch(slipLimit, () => {
	slipPage.value = 1;
});

watch(activeTab, (tab) => {
	if (tab === "slips" && !slipsLoaded.value && !slipLoading.value)
		fetchSlipLogs();
	if (tab === "usage" && !analyticsData.value && !analyticsLoading.value)
		fetchAnalytics();
});
</script>
