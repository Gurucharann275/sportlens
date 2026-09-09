const jpeg = require('jpeg-js');
import { analyzeVideoJumpKinematics } from './biomechanicsEngine';

function createJpeg(w: number, h: number, paintFn: (buf: Uint8Array, w: number, h: number) => void): string {
  const buf = new Uint8Array(w * h * 4);
  paintFn(buf, w, h);
  return jpeg.encode({ data: buf, width: w, height: h }, 60).data.toString('base64');
}

// Case A: Face Only (No legs, knees, or ankles in lower half)
function makeFaceFrame(w = 120, h = 160) {
  return createJpeg(w, h, (buf) => {
    const cx = w / 2, cy = h * 0.35, r = w * 0.3;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (d < r) {
          buf[idx] = 210;
          buf[idx + 1] = 160;
          buf[idx + 2] = 130;
        } else {
          buf[idx] = 45;
          buf[idx + 1] = 45;
          buf[idx + 2] = 45;
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
      buf[i] = 128;
      buf[i + 1] = 128;
      buf[i + 2] = 128;
      buf[i + 3] = 255;
    }
  });
}

// Case C & D: Full Body
function makeBodyFrame(w = 120, h = 160, yShift = 0) {
  return createJpeg(w, h, (buf) => {
    const cx = w / 2;
    for (let y = 0; y < h; y++) {
      const ny = y / h - yShift;
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        let isBody = false;
        if (ny >= 0.10 && ny <= 0.22 && Math.abs(x - cx) < 10) isBody = true;
        else if (ny > 0.22 && ny <= 0.50 && Math.abs(x - cx) < 22) isBody = true;
        else if (ny > 0.50 && ny <= 0.62 && Math.abs(x - cx) < 18) isBody = true;
        else if (ny > 0.62 && ny <= 0.95 && (Math.abs(x - (cx - 9)) < 6 || Math.abs(x - (cx + 9)) < 6)) isBody = true;

        if (isBody) {
          buf[idx] = 200;
          buf[idx + 1] = 180;
          buf[idx + 2] = 160;
        } else {
          buf[idx] = 35;
          buf[idx + 1] = 35;
          buf[idx + 2] = 35;
        }
        buf[idx + 3] = 255;
      }
    }
  });
}

function makeAccelStatic(count = 30) {
  const samples = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    samples.push({ x: 0.02, y: 0.98, z: 0.12, t: now + i * 50 });
  }
  return samples;
}

function makeAccelJump(count = 50) {
  const samples = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    let x = 0.02, y = 0.98, z = 0.12;
    if (i >= 10 && i < 15) {
      y = 0.75;
    } // Dip
    else if (i >= 15 && i < 20) {
      y = 1.65;
    } // Extension
    else if (i >= 20 && i < 30) {
      y = 0.15;
    } // Freefall 0.50s
    else if (i >= 30 && i < 34) {
      y = 2.45;
    } // Landing impact
    samples.push({ x, y, z, t: now + i * 50 });
  }
  return samples;
}

function runTests() {
  console.log('========================================================');
  console.log('SPORTLENS COMPUTER VISION & 10-GATE ANTI-CHEAT AUDIT');
  console.log('========================================================\n');

  // TEST CASE A: FACE ONLY
  console.log('>>> TEST CASE A: FACE ONLY');
  const faceSnaps = [{ base64: makeFaceFrame() }, { base64: makeFaceFrame() }];
  const resA = analyzeVideoJumpKinematics(2.0, 68, makeAccelStatic(), null, faceSnaps);
  console.log('Status: isValid =', resA.isValid, '| Score =', resA.score, '| Height =', resA.jumpHeightCm, 'cm');
  console.log('Gate 2 (Keypoints):', resA.gates![1].passed ? 'PASS' : 'FAIL', '-', resA.gates![1].telemetry);
  console.log('Gate 10 (Metric Calculated):', resA.gates![9].passed ? 'PASS' : 'FAIL', '-', resA.gates![9].telemetry);

  // TEST CASE B: BLANK WALL
  console.log('\n>>> TEST CASE B: BLANK WALL / FLAT SURFACE');
  const wallSnaps = [{ base64: makeWallFrame() }];
  const resB = analyzeVideoJumpKinematics(2.0, 68, makeAccelStatic(), null, wallSnaps);
  console.log('Status: isValid =', resB.isValid, '| Score =', resB.score, '| Height =', resB.jumpHeightCm, 'cm');
  console.log('Gate 1 (Single Athlete):', resB.gates![0].passed ? 'PASS' : 'FAIL', '-', resB.gates![0].telemetry);
  console.log('Gate 10 (Metric Calculated):', resB.gates![9].passed ? 'PASS' : 'FAIL', '-', resB.gates![9].telemetry);

  // TEST CASE C: STANDING STILL
  console.log('\n>>> TEST CASE C: ATHLETE STANDING STILL (0 MOVEMENT)');
  const stillSnaps = [
    { base64: makeBodyFrame(120, 160, 0) },
    { base64: makeBodyFrame(120, 160, 0) },
    { base64: makeBodyFrame(120, 160, 0) },
  ];
  const resC = analyzeVideoJumpKinematics(2.0, 68, makeAccelStatic(), null, stillSnaps);
  console.log('Status: isValid =', resC.isValid, '| Score =', resC.score, '| Height =', resC.jumpHeightCm, 'cm');
  console.log('Gate 6 (Movement Detected):', resC.gates![5].passed ? 'PASS' : 'FAIL', '-', resC.gates![5].telemetry);
  console.log('Gate 7 (Exercise Events):', resC.gates![6].passed ? 'PASS' : 'FAIL', '-', resC.gates![6].telemetry);
  console.log('Gate 10 (Metric Calculated):', resC.gates![9].passed ? 'PASS' : 'FAIL', '-', resC.gates![9].telemetry);

  // TEST CASE D: GENUINE JUMP
  console.log('\n>>> TEST CASE D: GENUINE ATHLETIC VERTICAL JUMP');
  const jumpSnaps = [
    { base64: makeBodyFrame(120, 160, 0) }, // Stance
    { base64: makeBodyFrame(120, 160, -0.06) }, // Dip downwards
    { base64: makeBodyFrame(120, 160, 0.14) }, // Takeoff & flight apex
    { base64: makeBodyFrame(120, 160, 0) }, // Landing
  ];
  const resD = analyzeVideoJumpKinematics(2.5, 68, makeAccelJump(), null, jumpSnaps);
  console.log('Status: isValid =', resD.isValid, '| Score =', resD.score);
  console.log('Calculated Jump Height:', resD.jumpHeightCm, 'cm');
  console.log('Calculated Flight Time:', resD.flightTimeSec, 's');
  console.log('Calculated Sayers Power:', resD.peakPowerWatts, 'Watts (' + resD.relativePowerWattsPerKg + ' W/kg)');
  console.log('\nAll 10 Verification Gates for Genuine Jump:');
  resD.gates!.forEach((g) => {
    console.log('  Gate ' + g.gateNumber + ' [' + (g.passed ? 'PASS' : 'FAIL') + '] ' + g.title + ': ' + g.telemetry);
  });

  const allPassed =
    resA.isValid === false &&
    resA.score === 0 &&
    resB.isValid === false &&
    resB.score === 0 &&
    resC.isValid === false &&
    resC.score === 0 &&
    resD.isValid === true &&
    resD.score > 0 &&
    resD.jumpHeightCm > 0;

  console.log('\n========================================================');
  console.log('AUDIT VERIFICATION RESULT:', allPassed ? 'ALL 4 TEST CRITERIA PASSED 100%' : 'FAILURES DETECTED');
  console.log('========================================================');
}

runTests();
