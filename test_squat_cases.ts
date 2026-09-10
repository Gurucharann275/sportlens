const jpeg = require('jpeg-js');
declare var Buffer: any;
import { analyzeSquatKinematics } from './squatEngine';

function createJpeg(w: number, h: number, paintFn: (buf: Uint8Array, w: number, h: number) => void): string {
  const buf = new Uint8Array(w * h * 4);
  paintFn(buf, w, h);
  return jpeg.encode({ data: buf, width: w, height: h }, 60).data.toString('base64');
}

// Case A: Face Only
function makeFaceFrame(w = 120, h = 160) {
  return createJpeg(w, h, (buf) => {
    const cx = w / 2, cy = h * 0.35, r = w * 0.3;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (d < r) {
          buf[idx] = 210; buf[idx + 1] = 160; buf[idx + 2] = 130;
        } else {
          buf[idx] = 45; buf[idx + 1] = 45; buf[idx + 2] = 45;
        }
        buf[idx + 3] = 255;
      }
    }
  });
}

// Case B: Blank Wall
function makeWallFrame(w = 120, h = 160) {
  return createJpeg(w, h, (buf) => {
    for (let i = 0; i < buf.length; i += 4) {
      buf[i] = 128; buf[i + 1] = 128; buf[i + 2] = 128; buf[i + 3] = 255;
    }
  });
}

// Case C & D: Full Body with Squat Compression
// compressionRatio: 0 = standing upright (full height ~0.85 of frame), 0.25 = 25% squat depth compression
function makeSquatFrame(w = 120, h = 160, compressionRatio = 0.0) {
  return createJpeg(w, h, (buf) => {
    const cx = w / 2;
    // Standing: top=0.10, bot=0.95 (height 0.85)
    // Squatting: hips and head lower, top lowers towards bot
    const topNy = 0.10 + compressionRatio;
    const botNy = 0.95;
    const currentHeight = botNy - topNy;

    for (let y = 0; y < h; y++) {
      const ny = y / h;
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        let isBody = false;

        if (ny >= topNy && ny <= botNy) {
          const relY = (ny - topNy) / currentHeight;
          if (relY < 0.18 && Math.abs(x - cx) < 10) isBody = true; // Head
          else if (relY >= 0.18 && relY < 0.48 && Math.abs(x - cx) < 22) isBody = true; // Torso
          else if (relY >= 0.48 && relY < 0.65 && Math.abs(x - cx) < 20) isBody = true; // Pelvis/Hips
          else if (relY >= 0.65 && (Math.abs(x - (cx - 10)) < 7 || Math.abs(x - (cx + 10)) < 7)) isBody = true; // Legs/Feet
        }

        if (isBody) {
          buf[idx] = 200; buf[idx + 1] = 180; buf[idx + 2] = 160;
        } else {
          buf[idx] = 35; buf[idx + 1] = 35; buf[idx + 2] = 35;
        }
        buf[idx + 3] = 255;
      }
    }
  });
}

// Static IMU: Stationary camera mount (1.0G baseline, jitter < 0.05G)
function makeAccelStatic(count = 40) {
  const samples = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    samples.push({ x: 0.02, y: 0.98, z: 0.12, t: now + i * 50 });
  }
  return samples;
}

// Case E IMU: Moving/shaking phone without squatting
function makeAccelShaking(count = 40) {
  const samples = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const shake = Math.sin(i * 0.9) * 0.85;
    samples.push({ x: 0.2 + shake, y: 1.0 + shake * 0.7, z: 0.3 + shake * 0.5, t: now + i * 50 });
  }
  return samples;
}

async function runSquatTests() {
  console.log('================================================================');
  console.log('SPORTLENS SQUAT ASSESSMENT ACCEPTANCE SUITE');
  console.log('================================================================\n');

  // TEST CASE A: FACE ONLY
  console.log('>>> TEST CASE A: FACE ONLY RECORDING');
  const faceSnaps = [{ base64: makeFaceFrame() }, { base64: makeFaceFrame() }];
  const resA = analyzeSquatKinematics(2.5, 68, makeAccelStatic(), null, faceSnaps);
  console.log('Status: isValid =', resA.isValid, '| Score =', resA.score, '| Reps =', resA.repetitionCount);
  console.log('Gate 2 (Full-Body Framing):', resA.gates[1].passed ? 'PASS' : 'FAIL', '-', resA.gates[1].telemetry);
  console.log('Gate 10 (Metric Calculated):', resA.gates[9].passed ? 'PASS' : 'FAIL', '-', resA.gates[9].telemetry);

  // TEST CASE B: BLANK WALL
  console.log('\n>>> TEST CASE B: BLANK WALL / EMPTY ROOM');
  const wallSnaps = [{ base64: makeWallFrame() }, { base64: makeWallFrame() }];
  const resB = analyzeSquatKinematics(2.5, 68, makeAccelStatic(), null, wallSnaps);
  console.log('Status: isValid =', resB.isValid, '| Score =', resB.score, '| Reps =', resB.repetitionCount);
  console.log('Gate 1 (Single Athlete):', resB.gates[0].passed ? 'PASS' : 'FAIL', '-', resB.gates[0].telemetry);
  console.log('Gate 10 (Metric Calculated):', resB.gates[9].passed ? 'PASS' : 'FAIL', '-', resB.gates[9].telemetry);

  // TEST CASE C: FULL-BODY STANDING STILL (0 REPS)
  console.log('\n>>> TEST CASE C: FULL-BODY STANDING STILL (0 MOVEMENT)');
  const stillSnaps = [
    { base64: makeSquatFrame(120, 160, 0.0) },
    { base64: makeSquatFrame(120, 160, 0.0) },
    { base64: makeSquatFrame(120, 160, 0.0) },
    { base64: makeSquatFrame(120, 160, 0.0) },
  ];
  const resC = analyzeSquatKinematics(2.5, 68, makeAccelStatic(), null, stillSnaps);
  console.log('Status: isValid =', resC.isValid, '| Score =', resC.score, '| Reps =', resC.repetitionCount);
  console.log('Gate 6 (Movement Detected):', resC.gates[5].passed ? 'PASS' : 'FAIL', '-', resC.gates[5].telemetry);
  console.log('Gate 7 (Squat Events):', resC.gates[6].passed ? 'PASS' : 'FAIL', '-', resC.gates[6].telemetry);
  console.log('Gate 10 (Metric Calculated):', resC.gates[9].passed ? 'PASS' : 'FAIL', '-', resC.gates[9].telemetry);

  // TEST CASE D: GENUINE SQUAT REPETITION (ECCENTRIC -> DEPTH INFLECTION -> CONCENTRIC)
  console.log('\n>>> TEST CASE D: GENUINE SQUAT REPETITION (25% DEPTH COMPRESSION)');
  const squatSnaps = [
    // Standing ready stance (baseline height)
    { base64: makeSquatFrame(120, 160, 0.0) },
    { base64: makeSquatFrame(120, 160, 0.0) },
    // Eccentric descent
    { base64: makeSquatFrame(120, 160, 0.12) },
    { base64: makeSquatFrame(120, 160, 0.22) },
    // Inflection point (bottom of squat: 28% compression)
    { base64: makeSquatFrame(120, 160, 0.28) },
    // Concentric ascent
    { base64: makeSquatFrame(120, 160, 0.18) },
    { base64: makeSquatFrame(120, 160, 0.08) },
    // Return to standing
    { base64: makeSquatFrame(120, 160, 0.0) },
    { base64: makeSquatFrame(120, 160, 0.0) },
  ];
  const resD = analyzeSquatKinematics(3.0, 68, makeAccelStatic(60), null, squatSnaps);
  console.log('Status: isValid =', resD.isValid, '| Score =', resD.score);
  console.log('Completed Repetitions:', resD.repetitionCount);
  console.log('Max Depth Compression:', resD.maxDepthCompressionPercent + '%');
  console.log('Mean Rep Duration:', resD.meanRepDurationSec ? resD.meanRepDurationSec + 's' : 'N/A');
  console.log('3D Valgus Stability (°):', resD.valgusStabilityDeg === null ? 'UNAVAILABLE (Requires 3D Tracking Markers)' : resD.valgusStabilityDeg);
  console.log('\nAll 10 Verification Gates for Genuine Squat:');
  resD.gates.forEach((g) => {
    console.log('  Gate ' + g.gateNumber + ' [' + (g.passed ? 'PASS' : 'FAIL') + '] ' + g.title + ': ' + g.telemetry);
  });

  // TEST CASE E: MOVE PHONE AROUND WITHOUT SQUATTING
  console.log('\n>>> TEST CASE E: MOVE PHONE AROUND WITHOUT SQUATTING (SHAKING)');
  const resE = analyzeSquatKinematics(2.5, 68, makeAccelShaking(), null, stillSnaps);
  console.log('Status: isValid =', resE.isValid, '| Score =', resE.score);
  console.log('Gate 4 (Camera Stable):', resE.gates[3].passed ? 'PASS' : 'FAIL', '-', resE.gates[3].telemetry);
  console.log('Gate 8 (IMU Agreement):', resE.gates[7].passed ? 'PASS' : 'FAIL', '-', resE.gates[7].telemetry);
  console.log('Gate 10 (Metric Calculated):', resE.gates[9].passed ? 'PASS' : 'FAIL', '-', resE.gates[9].telemetry);

  const allPassed =
    resA.isValid === false && resA.score === 0 &&
    resB.isValid === false && resB.score === 0 &&
    resC.isValid === false && resC.score === 0 &&
    resD.isValid === true && resD.score > 0 && resD.repetitionCount >= 1 && resD.maxDepthCompressionPercent >= 15 &&
    resD.valgusStabilityDeg === null &&
    resE.isValid === false && resE.score === 0;

  console.log('\n================================================================');
  console.log('SQUAT AUDIT VERIFICATION RESULT:', allPassed ? 'ALL 5 ACCEPTANCE CRITERIA PASSED 100%' : 'FAILURES DETECTED');
  console.log('================================================================');
}

runSquatTests();
