<script setup>
import {
	Activity,
	Battery,
	Cloud,
	Eye,
	Focus,
	Layers,
	Map as MapIcon,
	Palette,
	Settings,
	SlidersHorizontal,
	Smartphone,
	Sparkles,
	Trash2,
	X,
	Zap,
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useUserPreferencesStore } from "@/store/userPreferencesStore";

const props = defineProps({
	isOpen: Boolean,
});

const emit = defineEmits(["close"]);

const prefs = useUserPreferencesStore();
const { t } = useI18n();

const handleClearData = () => {
	if (confirm(t("settings.confirm_clear_data"))) {
		localStorage.clear();
		location.reload();
	}
};
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[7000] flex items-end sm:items-center justify-center pointer-events-auto"
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity"
      @click="emit('close')"
    ></div>

    <!-- Panel -->
    <div
      class="relative w-full max-w-md bg-zinc-900 border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl transform transition-transform duration-300"
    >
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-bold text-white flex items-center gap-2">
          <Settings class="w-5 h-5 text-blue-400" />
          {{ t("settings.title") || "Settings" }}
        </h2>
        <button
          @click="emit('close')"
          class="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Settings List -->
      <div class="space-y-4">
        <!-- Visual Preset -->
        <div class="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
          <div class="flex items-center gap-3">
            <Palette class="w-5 h-5 text-fuchsia-400" />
            <div>
              <div class="text-sm font-bold text-white">
                {{ t("settings.presets_title") }}
              </div>
              <div class="text-xs text-white/50">
                {{ t("settings.presets_desc") }}
              </div>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <button
              @click="prefs.applyMapPreset('smooth')"
              :class="[
                'py-2 rounded-lg text-xs font-black transition-all',
                prefs.mapVisualPreset === 'smooth'
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white/80',
              ]"
            >
              {{ t("settings.preset_smooth") }}
            </button>
            <button
              @click="prefs.applyMapPreset('colorful')"
              :class="[
                'py-2 rounded-lg text-xs font-black transition-all',
                prefs.mapVisualPreset === 'colorful'
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white/80',
              ]"
            >
              {{ t("settings.preset_colorful") }}
            </button>
            <button
              @click="prefs.applyMapPreset('cinematic')"
              :class="[
                'py-2 rounded-lg text-xs font-black transition-all',
                prefs.mapVisualPreset === 'cinematic'
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white/80',
              ]"
            >
              {{ t("settings.preset_cinematic") }}
            </button>
          </div>
        </div>

        <!-- Motion Budget -->
        <div class="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
          <div class="flex items-center gap-3">
            <SlidersHorizontal class="w-5 h-5 text-cyan-400" />
            <div>
              <div class="text-sm font-bold text-white">
                {{ t("settings.motion_budget_title") }}
              </div>
              <div class="text-xs text-white/50">
                {{ t("settings.motion_budget_desc") }}
              </div>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <button
              @click="prefs.setMotionBudget('micro')"
              :class="[
                'py-2 rounded-lg text-xs font-black transition-all',
                prefs.motionBudget === 'micro'
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white/80',
              ]"
            >
              {{ t("settings.motion_micro") }}
            </button>
            <button
              @click="prefs.setMotionBudget('balanced')"
              :class="[
                'py-2 rounded-lg text-xs font-black transition-all',
                prefs.motionBudget === 'balanced'
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white/80',
              ]"
            >
              {{ t("settings.motion_balanced") }}
            </button>
            <button
              @click="prefs.setMotionBudget('full')"
              :class="[
                'py-2 rounded-lg text-xs font-black transition-all',
                prefs.motionBudget === 'full'
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white/80',
              ]"
            >
              {{ t("settings.motion_full") }}
            </button>
          </div>
        </div>

        <!-- Haptics -->
        <div
          class="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5"
        >
          <div class="flex items-center gap-3">
            <Smartphone class="w-5 h-5 text-purple-400" />
            <div>
              <div class="text-sm font-bold text-white">
                {{ t("settings.haptics_title") }}
              </div>
              <div class="text-xs text-white/50">
                {{ t("settings.haptics_desc") }}
              </div>
            </div>
          </div>
          <button
            @click="prefs.toggleHaptics"
            :class="[
              'w-12 h-7 rounded-full transition-colors relative',
              prefs.isHapticsEnabled ? 'bg-blue-500' : 'bg-white/20',
            ]"
          >
            <div
              :class="[
                'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform shadow-sm',
                prefs.isHapticsEnabled ? 'left-6' : 'left-1',
              ]"
            ></div>
          </button>
        </div>

        <!-- Reduced Motion -->
        <div
          class="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5"
        >
          <div class="flex items-center gap-3">
            <Eye class="w-5 h-5 text-teal-400" />
            <div>
              <div class="text-sm font-bold text-white">
                {{ t("settings.motion_title") }}
              </div>
              <div class="text-xs text-white/50">
                {{ t("settings.motion_desc") }}
              </div>
            </div>
          </div>
          <button
            @click="prefs.toggleReducedMotion"
            :class="[
              'w-12 h-7 rounded-full transition-colors relative',
              prefs.isReducedMotion ? 'bg-blue-500' : 'bg-white/20',
            ]"
          >
            <div
              :class="[
                'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform shadow-sm',
                prefs.isReducedMotion ? 'left-6' : 'left-1',
              ]"
            ></div>
          </button>
        </div>

        <!-- Low Power Mode -->
        <div
          class="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5"
        >
          <div class="flex items-center gap-3">
            <Battery class="w-5 h-5 text-yellow-400" />
            <div>
              <div class="text-sm font-bold text-white">
                {{ t("settings.power_title") }}
              </div>
              <div class="text-xs text-white/50">
                {{ t("settings.power_desc") }}
              </div>
            </div>
          </div>
          <button
            @click="prefs.toggleLowPowerMode"
            :class="[
              'w-12 h-7 rounded-full transition-colors relative',
              prefs.isLowPowerMode ? 'bg-blue-500' : 'bg-white/20',
            ]"
          >
            <div
              :class="[
                'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform shadow-sm',
                prefs.isLowPowerMode ? 'left-6' : 'left-1',
              ]"
            ></div>
          </button>
        </div>

        <!-- Map Haptics -->
        <div
          class="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5"
        >
          <div class="flex items-center gap-3">
            <Activity class="w-5 h-5 text-emerald-400" />
            <div>
              <div class="text-sm font-bold text-white">
                {{ t("settings.map_haptics_title") }}
              </div>
              <div class="text-xs text-white/50">
                {{ t("settings.map_haptics_desc") }}
              </div>
            </div>
          </div>
          <button
            @click="prefs.toggleMapHaptics"
            :class="[
              'w-12 h-7 rounded-full transition-colors relative',
              prefs.isMapHapticsEnabled ? 'bg-blue-500' : 'bg-white/20',
            ]"
          >
            <div
              :class="[
                'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform shadow-sm',
                prefs.isMapHapticsEnabled ? 'left-6' : 'left-1',
              ]"
            ></div>
          </button>
        </div>

        <!-- Ambient FX -->
        <div
          class="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5"
        >
          <div class="flex items-center gap-3">
            <Sparkles class="w-5 h-5 text-pink-400" />
            <div>
              <div class="text-sm font-bold text-white">
                {{ t("settings.ambient_title") }}
              </div>
              <div class="text-xs text-white/50">
                {{ t("settings.ambient_desc") }}
              </div>
            </div>
          </div>
          <button
            @click="prefs.toggleAmbientFx"
            :class="[
              'w-12 h-7 rounded-full transition-colors relative',
              prefs.isAmbientFxEnabled ? 'bg-blue-500' : 'bg-white/20',
            ]"
          >
            <div
              :class="[
                'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform shadow-sm',
                prefs.isAmbientFxEnabled ? 'left-6' : 'left-1',
              ]"
            ></div>
          </button>
        </div>

        <!-- Neon Pulse -->
        <div
          class="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5"
        >
          <div class="flex items-center gap-3">
            <Zap class="w-5 h-5 text-cyan-400" />
            <div>
              <div class="text-sm font-bold text-white">
                {{ t("settings.neon_title") }}
              </div>
              <div class="text-xs text-white/50">
                {{ t("settings.neon_desc") }}
              </div>
            </div>
          </div>
          <button
            @click="prefs.toggleNeonPulse"
            :class="[
              'w-12 h-7 rounded-full transition-colors relative',
              prefs.isNeonPulseEnabled ? 'bg-blue-500' : 'bg-white/20',
            ]"
          >
            <div
              :class="[
                'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform shadow-sm',
                prefs.isNeonPulseEnabled ? 'left-6' : 'left-1',
              ]"
            ></div>
          </button>
        </div>

        <!-- Heatmap -->
        <div
          class="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5"
        >
          <div class="flex items-center gap-3">
            <MapIcon class="w-5 h-5 text-emerald-400" />
            <div>
              <div class="text-sm font-bold text-white">
                {{ t("settings.heatmap_title") }}
              </div>
              <div class="text-xs text-white/50">
                {{ t("settings.heatmap_desc") }}
              </div>
            </div>
          </div>
          <button
            @click="prefs.toggleHeatmap"
            :class="[
              'w-12 h-7 rounded-full transition-colors relative',
              prefs.isHeatmapEnabled ? 'bg-blue-500' : 'bg-white/20',
            ]"
          >
            <div
              :class="[
                'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform shadow-sm',
                prefs.isHeatmapEnabled ? 'left-6' : 'left-1',
              ]"
            ></div>
          </button>
        </div>

        <!-- 3D Buildings -->
        <div
          class="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5"
        >
          <div class="flex items-center gap-3">
            <Layers class="w-5 h-5 text-violet-400" />
            <div>
              <div class="text-sm font-bold text-white">
                {{ t("settings.buildings_title") }}
              </div>
              <div class="text-xs text-white/50">
                {{ t("settings.buildings_desc") }}
              </div>
            </div>
          </div>
          <button
            @click="prefs.toggle3dBuildings"
            :class="[
              'w-12 h-7 rounded-full transition-colors relative',
              prefs.is3dBuildingsEnabled ? 'bg-blue-500' : 'bg-white/20',
            ]"
          >
            <div
              :class="[
                'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform shadow-sm',
                prefs.is3dBuildingsEnabled ? 'left-6' : 'left-1',
              ]"
            ></div>
          </button>
        </div>

        <!-- Map Fog -->
        <div
          class="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5"
        >
          <div class="flex items-center gap-3">
            <Cloud class="w-5 h-5 text-slate-400" />
            <div>
              <div class="text-sm font-bold text-white">
                {{ t("settings.fog_title") }}
              </div>
              <div class="text-xs text-white/50">
                {{ t("settings.fog_desc") }}
              </div>
            </div>
          </div>
          <button
            @click="prefs.toggleMapFog"
            :class="[
              'w-12 h-7 rounded-full transition-colors relative',
              prefs.isMapFogEnabled ? 'bg-blue-500' : 'bg-white/20',
            ]"
          >
            <div
              :class="[
                'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform shadow-sm',
                prefs.isMapFogEnabled ? 'left-6' : 'left-1',
              ]"
            ></div>
          </button>
        </div>

        <!-- Live Chips -->
        <div
          class="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5"
        >
          <div class="flex items-center gap-3">
            <Activity class="w-5 h-5 text-amber-400" />
            <div>
              <div class="text-sm font-bold text-white">
                {{ t("settings.live_chips_title") }}
              </div>
              <div class="text-xs text-white/50">
                {{ t("settings.live_chips_desc") }}
              </div>
            </div>
          </div>
          <button
            @click="prefs.toggleLiveChips"
            :class="[
              'w-12 h-7 rounded-full transition-colors relative',
              prefs.isLiveChipsEnabled ? 'bg-blue-500' : 'bg-white/20',
            ]"
          >
            <div
              :class="[
                'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform shadow-sm',
                prefs.isLiveChipsEnabled ? 'left-6' : 'left-1',
              ]"
            ></div>
          </button>
        </div>

        <!-- Viewport Glow -->
        <div
          class="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5"
        >
          <div class="flex items-center gap-3">
            <Focus class="w-5 h-5 text-indigo-400" />
            <div>
              <div class="text-sm font-bold text-white">
                {{ t("settings.viewport_glow_title") }}
              </div>
              <div class="text-xs text-white/50">
                {{ t("settings.viewport_glow_desc") }}
              </div>
            </div>
          </div>
          <button
            @click="prefs.toggleViewportGlow"
            :class="[
              'w-12 h-7 rounded-full transition-colors relative',
              prefs.isViewportGlowEnabled ? 'bg-blue-500' : 'bg-white/20',
            ]"
          >
            <div
              :class="[
                'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform shadow-sm',
                prefs.isViewportGlowEnabled ? 'left-6' : 'left-1',
              ]"
            ></div>
          </button>
        </div>

        <!-- Danger Zone -->
        <div class="pt-4 border-t border-white/10">
          <button
            @click="handleClearData"
            class="w-full flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors border border-red-500/20"
          >
            <Trash2 class="w-5 h-5" />
            <span class="text-sm font-bold">{{
              t("settings.clear_data")
            }}</span>
          </button>
        </div>

        <!-- Legal Links -->
        <div class="grid grid-cols-2 gap-4 mt-2">
          <a
            href="#"
            class="text-xs text-white/30 hover:text-white text-center py-2"
            >{{ t("settings.privacy") }}</a
          >
          <a
            href="#"
            class="text-xs text-white/30 hover:text-white text-center py-2"
            >{{ t("settings.terms") }}</a
          >
        </div>

        <div class="text-center text-[10px] text-white/20 font-mono pt-4">
          VibeCity v2.0.0 (Build 2026.02.05)
        </div>
      </div>
    </div>
  </div>
</template>
