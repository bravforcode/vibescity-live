<script setup lang="ts">
import DOMPurify from "dompurify";
import { computed } from "vue";

interface SafeHtmlProps {
	content: string;
	tag?: string;
}

const props = withDefaults(defineProps<SafeHtmlProps>(), {
	tag: "span",
});

const sanitizedContent = computed(() =>
	DOMPurify.sanitize(String(props.content || ""), {
		ALLOWED_URI_REGEXP:
			/^(?:(?:https?|mailto|tel|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.-]|$))/i,
	}),
);
</script>

<template>
  <component :is="tag" v-html="sanitizedContent" />
</template>
