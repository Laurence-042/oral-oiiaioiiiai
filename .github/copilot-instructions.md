# OIIAIOIIIAI - AI Coding Agent Instructions

**Project**: Real-time vowel recognition game using TensorFlow.js CNN model  
**Stack**: Vue 3 + TypeScript + TensorFlow.js + Vite  
**Status**: Production-ready ML detector, game logic in development

## Quick Start

```bash
npm run dev              # Dev server on http://localhost:3000
npm run build            # Production build (runs vue-tsc + vite)
npx tsc --noEmit        # Type checking only
```

**Test the detector**: Navigate to `/debug-ml` after starting dev server

## Architecture Overview

### Core Components

1. **ML Vowel Detector** ([src/composables/useVowelDetectorML.ts](src/composables/useVowelDetectorML.ts))
   - CNN model trained on TIMIT dataset (92% accuracy)
   - Input: 3360 audio samples (210ms @ 16kHz)
   - Output: 6-class probabilities (A, E, I, O, U, silence)
   - Real-time audio processing via Web Audio API `ScriptProcessorNode`
   - Auto-resampling from browser's native rate to 16kHz

2. **Legacy Formant Detector** ([src/composables/useVowelDetector.ts](src/composables/useVowelDetector.ts))
   - FFT-based F1/F2 formant analysis (~70% accuracy)
   - Kept as fallback/reference implementation

3. **Game State Manager** ([src/composables/useGameState.ts](src/composables/useGameState.ts))
   - Score tracking, combo system, stage progression
   - Sequence validation against target vowel patterns
   - Interrupt handling (silence timeout, errors)

### Data Flow

```
Microphone → AudioContext → ScriptProcessor → Resample Buffer (16kHz)
    ↓
Fill 3360 samples → TensorFlow.js CNN → Softmax probabilities
    ↓
Confidence filter → VowelDetectionResult → Event callbacks
    ↓
Game Logic (useGameState) → UI Updates
```

### Key Type Definitions

All types in [src/types/game.ts](src/types/game.ts):
- `Vowel`: `'A' | 'E' | 'I' | 'O' | 'U' | 'silence'`
- `VowelDetectionResult`: Contains `{ vowel, status, confidence, formants, volume, timestamp }`
- `GameStats`: Score, combo, stage, sequence progress
- `StageVisualConfig`: Per-stage effects (rotation speed, particles, chromatic aberration)

## Critical Patterns

### Using the ML Detector

```typescript
import { useVowelDetectorML } from '@/composables/useVowelDetectorML';

const { confirmedVowel, currentResult, start, stop, onVowelDetected } = useVowelDetectorML({
  modelPath: '/models/vowel/model.json' // optional, this is default
});

// Register callbacks BEFORE starting
onVowelDetected((vowel, result) => {
  console.log(`Detected: ${vowel}, confidence: ${result.confidence}`);
});

// Lifecycle
onMounted(() => start());
onUnmounted(() => {
  stop();
  // Model cleanup handled automatically
});
```

**Always call callbacks before `start()`** - the detector begins processing immediately after initialization.

### Component Cleanup

TensorFlow.js requires explicit memory management:

```typescript
// In useVowelDetectorML cleanup
if (model) {
  model.dispose();
  tf.disposeVariables(); // Clean up any leaked tensors
}
```

When writing new TensorFlow code, wrap operations in `tf.tidy()`:

```typescript
const result = tf.tidy(() => {
  const input = tf.tensor2d(audioData, [1, INPUT_SAMPLES]);
  const prediction = model.predict(input) as tf.Tensor;
  return prediction.dataSync(); // Extract before tidy disposes
});
```

### Audio Resampling (Critical for Model Accuracy)

Model expects 16kHz but browsers default to 44.1kHz/48kHz:

```typescript
// Linear interpolation resampling in useVowelDetectorML
const resampleRatio = actualSampleRate / TARGET_SAMPLE_RATE;
for (let i = 0; i < targetLength; i++) {
  const sourcePos = i * resampleRatio;
  const intPart = Math.floor(sourcePos);
  const fracPart = sourcePos - intPart;
  // Interpolate between samples
}
```

**Do not skip resampling** - direct 44.1kHz input causes 70% accuracy drop.

### Stage System

Stages defined in [src/config/stages.ts](src/config/stages.ts):

- Stage 1 (初醒): 0 points, 60°/s rotation
- Stage 2 (躁动): 500 points, particles enabled
- Stage 3 (狂热): 2000 points, chromatic aberration
- Stage 4 (超度): 5000 points, intense effects
- Stage 5 (神猫): 10000 points, maximum chaos

Each stage has `StageVisualConfig` with:
- `cat.rotationSpeed`: Angular velocity
- `background.particles`: Count, speed, colors
- `screenEffects`: shake, vignette, chromatic

Calculate stage: `calculateStage(score)` - uses binary search over thresholds.

### Vowel Sequences

Presets in [src/config/vowels.ts](src/config/vowels.ts):

```typescript
standard: ['U', 'I', 'I', 'A', 'I', 'O', 'U', 'I', 'I', 'I', 'A', 'I']
simple:   ['O', 'I', 'I', 'A', 'I', 'O', 'I', 'I', 'I', 'A', 'I']
```

Game validates detected vowels against current sequence position. Match = score + advance, mismatch = consecutive error counter.

## File Organization

```
src/
├── composables/          # Business logic (Vue 3 Composition API)
│   ├── useVowelDetectorML.ts    # ⭐ CNN detector (451 lines)
│   ├── useVowelDetector.ts       # Legacy formant detector
│   └── useGameState.ts           # Game state machine (484 lines)
├── components/           # Reusable Vue components
├── views/               # Route-level pages
│   ├── DebugMLDetector.vue      # ⭐ Full ML testing UI (800+ lines)
│   ├── DebugView.vue             # Legacy debug (formant)
│   └── AudioAnalyzer.vue         # Spectrogram visualizer
├── types/
│   └── game.ts          # ⭐ All TypeScript interfaces (224 lines)
├── config/
│   ├── stages.ts        # Stage thresholds & visual configs (247 lines)
│   └── vowels.ts        # Sequence presets & formant ranges (237 lines)
└── router/index.ts      # Vue Router config

public/models/vowel/
├── model.json           # TF.js model architecture (37KB)
└── group1-shard1of1.bin # uint8 quantized weights (69KB)
```

## Development Workflows

### Testing ML Detector

1. `npm run dev` → visit `/debug-ml`
2. Click "启动监听" (Start Listening)
3. Grant microphone permission
4. Speak vowels (A/E/I/O/U) clearly
5. Monitor: confidence (target >80%), latency (<100ms), volume (>-40dB)

**Debugging checklist**:
- Model 404? Check `public/models/vowel/` files exist
- No detection? Verify volume bar shows >-40dB
- Low confidence? Check for background noise or speak closer to mic
- High latency? Check WebGL backend: `tf.backend() === 'webgl'`

### Adding New Routes

Routes lazy-load by default (code splitting):

```typescript
// src/router/index.ts
{
  path: '/new-feature',
  name: 'new-feature',
  component: () => import('@/views/NewFeature.vue'),
  meta: { title: 'Display Title' }
}
```

Title updates via `router.beforeEach` hook appending " | OIIAIOIIIAI".

### Type Safety

All game-related types in [src/types/game.ts](src/types/game.ts). When adding features:

1. Define interfaces in `game.ts`
2. Export from composable return types
3. Use strict typing - avoid `any`

Example:

```typescript
// game.ts
export interface NewFeatureConfig {
  threshold: number;
  enabled: boolean;
}

// composable
export interface UseNewFeatureReturn {
  config: Ref<NewFeatureConfig>;
  update: (config: Partial<NewFeatureConfig>) => void;
}
```

## Common Issues

**TypeScript Error: Cannot find module '@/...'**  
→ Check `vite.config.ts` alias: `'@': fileURLToPath(new URL('./src', import.meta.url))`

**Audio Not Working in Production**  
→ Requires HTTPS or localhost (getUserMedia constraint)  
→ Vite dev server has auto-SSL via `@vitejs/plugin-basic-ssl`

**Model Loading Slow**  
→ Model is lazy-loaded on first detector init  
→ Preload: `<link rel="preload" href="/models/vowel/model.json">`

**Memory Leak During Development**  
→ Hot reload doesn't cleanup TensorFlow  
→ Hard refresh browser tab or restart dev server

## Performance Targets

| Metric | Target | Acceptable |
|--------|--------|------------|
| Inference latency | 50-100ms | <150ms |
| Detection confidence | >80% | >50% |
| Model accuracy | 92% | >85% |
| Memory usage | <50MB | <100MB |

## Model Training Status

### Current Model (TIMIT-based) - ⚠️ Deprecated

The existing model in `public/models/vowel/` was trained on TIMIT dataset. **Problem**: TIMIT vowels are surrounded by consonants, causing coarticulation effects that don't match this game's pure isolated vowel input. Result: 92% validation accuracy but poor real-world performance in `/debug-ml`.

### Planned Approach: Hillenbrand Vowel Dataset

New training strategy (to be implemented):
- **Dataset**: Hillenbrand Vowel Dataset (isolated sustained vowels)
- **Data augmentation**: Concatenate vowels in various sequences + add noise layers
- **Rationale**: Better matches actual gameplay where users produce sustained vowel sounds

### Notebook Reference

The old notebook [model/Vowel_CNN_Training.ipynb](model/Vowel_CNN_Training.ipynb) contains reusable patterns:
- Kaggle API token setup via environment variables
- Dataset download and caching logic
- Model export to TensorFlow.js format

When creating the new training notebook, preserve these infrastructure patterns.

## Documentation References

- Full ML detector API: [src/composables/VOWEL_DETECTOR_ML.md](src/composables/VOWEL_DETECTOR_ML.md)
- Quick start guide: [DEBUG_QUICK_START.md](DEBUG_QUICK_START.md)
- Game design document: [story.md](story.md) - full gameplay mechanics, scoring, visual stages

## Project Context

This is an interactive audio game where users sing the vowel sequence "OIIAIOIIIAI" (mimicking a viral spinning cat meme). 

**Current status**: Model tuning phase. The debug views (`/debug-ml`, `/analyzer`) are functional, but game UI views are pending until the vowel detection model performs reliably on real microphone input.

**Blocked on**: Training a new model with Hillenbrand dataset that handles isolated vowel sounds better than the TIMIT-trained model.

**After model is ready**: Implement game views per [story.md](story.md) design - scoring system, 5-stage visual progression, share/recording features, leaderboard.
