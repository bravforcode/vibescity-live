<template>
	<div class="map-placeholder" aria-hidden="true" data-testid="map-placeholder">
		<!-- Simple SVG ghost map representation mimicking roads and a grid -->
		<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
			<defs>
				<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
					<path d="M 40 0 L 0 0 0 40" fill="none" class="grid-line" />
				</pattern>
			</defs>
			<rect width="100%" height="100%" fill="url(#grid)" />
			<path d="M -10 -10 Q 50 150 150 200 T 500 400" fill="none" class="main-road fade-in" />
			<path d="M -10 400 Q 150 100 250 500 T 800 -10" fill="none" class="main-road secondary fade-in" />
		</svg>
		
		<div class="glow-orb fixed-orb-1" />
		<div class="glow-orb fixed-orb-2" />
	</div>
</template>

<script setup>
</script>

<style scoped>
.map-placeholder {
	position: absolute;
	inset: 0;
	background-color: #04040a;
	pointer-events: none;
	overflow: hidden;
}

.grid-line {
	stroke: rgba(255, 255, 255, 0.02);
	stroke-width: 1;
}

.main-road {
	stroke: rgba(255, 0, 128, 0.15);
	stroke-width: 2.5;
	stroke-dasharray: 4 4;
}
.secondary {
	stroke: rgba(0, 255, 255, 0.1);
	stroke-width: 1.5;
}

.glow-orb {
	position: absolute;
	width: 30vh;
	height: 30vh;
	border-radius: 50%;
	background: radial-gradient(circle, rgba(144, 19, 254, 0.08) 0%, rgba(144, 19, 254, 0) 70%);
	filter: blur(20px);
	will-change: transform;
}

.fixed-orb-1 {
	top: 20%;
	left: -5%;
	animation: pulse 8s ease-in-out infinite alternate;
}

.fixed-orb-2 {
	bottom: -10%;
	right: 15%;
	background: radial-gradient(circle, rgba(0, 229, 255, 0.06) 0%, rgba(0, 229, 255, 0) 70%);
	animation: pulse 12s ease-in-out infinite alternate-reverse;
}

.fade-in {
	animation: drawIn 3s ease-out forwards;
}

@keyframes drawIn {
	0% {
		stroke-dashoffset: 1000;
	}
	100% {
		stroke-dashoffset: 0;
	}
}

@keyframes pulse {
	0% {
		transform: scale(0.9) translate(0, 0);
	}
	100% {
		transform: scale(1.1) translate(20px, -20px);
	}
}
</style>
