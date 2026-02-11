<template>
  <div class="card-fan" ref="containerRef">
    <!-- 卡片区域 -->
    <div
      class="fan-track"
      :class="{ dragging: isPointerDown }"
      @pointerdown="onPointerDown"
      @wheel.prevent="onWheel"
    >
      <div
        v-for="(_, index) in count"
        :key="index"
        class="fan-card"
        :class="{ active: index === activeIndex }"
        :style="cardStyle(index)"
        @click="onCardClick(index)"
        @dragstart.prevent
      >
        <slot :name="`card-${index}`" :index="index" :isActive="index === activeIndex" />
      </div>
    </div>

    <!-- 圆点指示器 -->
    <div v-if="count > 1" class="fan-dots">
      <button
        v-for="i in count"
        :key="i"
        class="fan-dot"
        :class="{ active: i - 1 === activeIndex }"
        @click="goTo(i - 1)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';

const props = withDefaults(defineProps<{
  /** 卡片数量 */
  count: number;
  /** 初始激活索引 */
  initialIndex?: number;
}>(), {
  initialIndex: 0,
});

const emit = defineEmits<{
  (e: 'update:activeIndex', index: number): void;
}>();

// ── 状态 ──
const containerRef = ref<HTMLDivElement | null>(null);
const activeIndex = ref(props.initialIndex);
const dragOffset = ref(0); // 拖拽中的像素偏移

watch(() => props.initialIndex, (v) => { activeIndex.value = v; });

// ── 扇形布局计算 ──
const FAN_ANGLE = 8;           // 相邻卡片旋转角度差 (deg)
const FAN_TRANSLATE_X = 40;    // 相邻卡片水平偏移 (%)
const FAN_TRANSLATE_Y = 8;     // 相邻卡片垂直偏移 (px)
const FAN_SCALE_STEP = 0.08;   // 相邻卡片缩放差
const FAN_OPACITY_STEP = 0.25; // 相邻卡片透明度差

function cardStyle(index: number) {
  const diff = index - activeIndex.value;
  // 加入拖拽偏移的视觉映射（向右拖 dx>0 → 看前一张 → visualDiff 需增大）
  const dragFraction = dragOffset.value / 200; // 200px = 一张卡
  const visualDiff = diff + dragFraction;

  const angle = visualDiff * FAN_ANGLE;
  const tx = visualDiff * FAN_TRANSLATE_X;
  const ty = Math.abs(visualDiff) * FAN_TRANSLATE_Y;
  const scale = Math.max(0.7, 1 - Math.abs(visualDiff) * FAN_SCALE_STEP);
  const opacity = Math.max(0, 1 - Math.abs(visualDiff) * FAN_OPACITY_STEP);
  const zIndex = 100 - Math.round(Math.abs(visualDiff) * 10);

  return {
    transform: `translateX(${tx}%) translateY(${ty}px) rotate(${angle}deg) scale(${scale})`,
    opacity: String(opacity),
    zIndex,
    pointerEvents: Math.abs(diff) > 1 ? 'none' as const : 'auto' as const,
  };
}

// ── 导航 ──
function goTo(index: number) {
  const clamped = Math.max(0, Math.min(props.count - 1, index));
  activeIndex.value = clamped;
  emit('update:activeIndex', clamped);
}

function onCardClick(index: number) {
  if (index !== activeIndex.value && !isDragging) {
    goTo(index);
  }
}

// ── 拖拽 / 触摸 ──
let startX = 0;
let isDragging = false;
let pointerId: number | null = null;
/** 拖拽进行中（控制 CSS 过渡禁用） */
const isPointerDown = ref(false);

function onPointerDown(e: PointerEvent) {
  if (pointerId !== null) return;
  pointerId = e.pointerId;
  startX = e.clientX;
  isDragging = false;
  dragOffset.value = 0;
  isPointerDown.value = true;
  // 用 document 级别监听，避免子元素（img 等）劫持 pointer 事件
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
}

function onPointerMove(e: PointerEvent) {
  if (e.pointerId !== pointerId) return;
  const dx = e.clientX - startX;
  if (Math.abs(dx) > 5) isDragging = true;
  dragOffset.value = dx;
}

function onPointerUp(e: PointerEvent) {
  if (e.pointerId !== pointerId) return;
  pointerId = null;
  // 先恢复过渡（让卡片平滑回弹/切换）
  isPointerDown.value = false;

  const dx = dragOffset.value;
  dragOffset.value = 0;

  if (Math.abs(dx) > 50) {
    // 向左拖(dx<0) → 下一张，向右拖(dx>0) → 上一张
    goTo(activeIndex.value + (dx < 0 ? 1 : -1));
  }

  // 移除 document 级别监听
  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerUp);
  document.removeEventListener('pointercancel', onPointerUp);

  // 延迟清除 isDragging 防止 click 事件误触
  requestAnimationFrame(() => { isDragging = false; });
}

// 组件卸载时确保清理
onUnmounted(() => {
  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerUp);
  document.removeEventListener('pointercancel', onPointerUp);
});

// ── 滚轮 ──
function onWheel(e: WheelEvent) {
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    goTo(activeIndex.value + (e.deltaX > 0 ? 1 : -1));
  } else {
    goTo(activeIndex.value + (e.deltaY > 0 ? 1 : -1));
  }
}

// ── 暴露 ──
defineExpose({ goTo, activeIndex });
</script>

<style scoped>
.card-fan {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  user-select: none;
  -webkit-user-select: none;
}

.fan-track {
  position: relative;
  width: 100%;
  /* 卡片高度由内容决定，这里给个最小高度 */
  min-height: min(130vw, 520px);
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
  cursor: grab;
}

.fan-track:active {
  cursor: grabbing;
}

.fan-card {
  position: absolute;
  width: min(80vw, 320px);
  height: min(130vw, 520px);
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1),
              opacity 0.3s ease;
  transform-origin: bottom center;
  border-radius: 16px;
  overflow: hidden;
}

/* 拖拽中禁用过渡 */
.fan-track.dragging .fan-card {
  transition: none;
}

.fan-card.active {
  cursor: default;
}

/* ── 圆点指示器 ── */
.fan-dots {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.fan-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.25);
  padding: 0;
  cursor: pointer;
  transition: background 0.2s, transform 0.2s;
}

.fan-dot.active {
  background: #58a6ff;
  transform: scale(1.3);
}

.fan-dot:hover:not(.active) {
  background: rgba(255, 255, 255, 0.45);
}
</style>
