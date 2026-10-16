# CLASSROOM VISION AI

> **Standalone Computer Vision & ML Smart Classroom Monitoring System**
> Built with PixelCheck's minimalist visual design identity (#FFFFFF background, #000000 typography, and silver #D8DCE1 accents).

A fully browser-executed, client-side computer vision web application for real-time occupancy counting, person detection, and motion analysis. All model inference and camera processing happen locally on the user's device without any server uploads, hardware sensors, or cloud backend services.

---

## Features

- **PixelCheck Design Language**: Pure white `#FFFFFF` background, pure black `#000000` text, hairline borders, frosted glass panels, Inter Tight typography, and silver `#D8DCE1` 3D cubes.
- **Client-Side Computer Vision**: Real object detection using TensorFlow.js with the MobileNetV2 COCO-SSD pretrained model.
- **Live Camera Feed**: Real-time camera access via WebRTC `getUserMedia`, frame processing, and dynamic bounding box rendering.
- **Uploaded Image Analysis**: Support for JPEG, PNG, and WebP images with bounding boxes and actual model confidence scores.
- **Motion Analysis**: Sequential frame pixel differencing to report frame movement status (`NO SIGNIFICANT MOVEMENT`, `SLIGHT MOVEMENT`, `SIGNIFICANT MOVEMENT`).
- **Live Monitoring Metrics**: Track current count, maximum occupancy, total frames analyzed, average inference duration, and session event history.
- **Detailed Result Reports**: View full analysis reports at `/result` with model version, processing time, individual confidence values, and bbox coordinates.
- **Privacy Preserving**: 100% local processing in the browser. Zero cloud telemetry or frame saving.

---

## Quick Start (Local Development)

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### Installation & Development

```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install

# Start local development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Production Build & Verification

```bash
# Typecheck TypeScript files
npm run typecheck

# Build production bundle
npm run build

# Preview production build locally
npm run preview
```

The production output is generated in `frontend/dist/`.

---

## Deployment on Vercel

This is a standalone React SPA configured for single-command deployment on **Vercel**.

### Vercel Deployment Configuration

- **Framework Preset**: Vite
- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Client-Side Routing**: Configured in `frontend/vercel.json` with SPA rewrite rules (`/(.*)` -> `/index.html`).

### Deploying via Vercel CLI

```bash
# Install Vercel CLI if needed
npm i -g vercel

# Deploy from repository root
vercel --cwd frontend
```

Alternatively, import the repository into the Vercel Web Dashboard and select Vite preset.

---

## Architecture & Code Structure

```text
frontend/
├── public/
├── src/
│   ├── components/
│   │   ├── Navbar.tsx             # Minimal navigation header
│   │   └── SilverCubesScene.tsx   # Three.js scene with exactly 2 silver cubes
│   ├── pages/
│   │   ├── LandingPage.tsx        # Hero landing page (/)
│   │   ├── MonitoringPage.tsx     # Live camera & image monitoring (/home)
│   │   └── ResultPage.tsx         # Detailed analysis report (/result)
│   ├── services/
│   │   ├── cameraService.ts       # WebRTC camera lifecycle manager
│   │   ├── modelService.ts        # TensorFlow.js COCO-SSD inference engine
│   │   └── motionService.ts       # Frame differencing motion analyzer
│   ├── types/
│   │   └── vision.ts              # TypeScript interface definitions
│   ├── utils/
│   │   └── storage.ts             # Session storage preservation helpers
│   ├── App.tsx                    # React Router routes
│   ├── index.css                  # Tailwind CSS & PixelCheck styles
│   └── main.tsx                   # React entry point
├── package.json
├── tailwind.config.js
├── tsconfig.json
├── vercel.json                    # Vercel SPA rewrite configuration
└── vite.config.ts
```

---

## Technology Stack

- **Framework**: React 18 with TypeScript & Vite
- **UI & Styling**: Tailwind CSS, Lucide Icons, Custom CSS
- **3D Engine**: Three.js (for landing page silver cubes)
- **Machine Learning**: TensorFlow.js (`@tensorflow/tfjs`) & COCO-SSD (`@tensorflow-models/coco-ssd`)
- **Routing**: React Router v6

---

## Model & Limitations

- **ML Model**: MobileNetV2 COCO-SSD (`lite_mobilenet_v2`).
- **Target Class**: Filtered strictly to `person` detections.
- **Limitations**: Bounding box accuracy and confidence scores depend on lighting, occlusion, and distance. Motion analysis is based on frame pixel delta, not activity classification or identity tracking.
