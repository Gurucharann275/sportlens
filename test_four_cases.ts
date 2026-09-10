const jpeg = require('jpeg-js');
declare var Buffer: any;
import { analyzeVideoJumpKinematics } from './biomechanicsEngine';

function createJpeg(w: number, h: number, paintFn: (buf: Uint8Array, w: number, h: number) => void): string {
  const buf = new Uint8Array(w * h * 4);
  paintFn(buf, w, h);
  return jpeg.encode({ data: buf, width: w, height: h }, 60).data.toString('base64');
}

// Case A: Face Only (No legs, knees, or feet in lower frame)
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
function makeBodyFrame(w = 120, h = 160, elevationShift = 0) {
  return createJpeg(w, h, (buf) => {
    const cx = w / 2;
    for (let y = 0; y < h; y++) {
      // Screen space: y=0 is top, y=h is bottom.
      // Positive elevationShift raises the athlete upward (smaller y), negative lowers (dip).
      const ny = y / h + elevationShift;
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

// Static IMU: device propped stationary (1.0G baseline)
function makeAccelStatic(count = 30) {
  const samples = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    samples.push({ x: 0.02, y: 0.98, z: 0.12, t: now + i * 50 });
  }
  return samples;
}

// Genuine Jump IMU: dip -> explosive extension -> 0.45s freefall -> landing impact
function makeAccelJump(count = 50) {
  const samples = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    let x = 0.02, y = 0.98, z = 0.12;
    if (i >= 10 && i < 15) {
      y = 0.75;
    } // Countermovement dip
    else if (i >= 15 && i < 20) {
      y = 1.65;
    } // Explosive extension
    else if (i >= 20 && i < 29) {
      y = 0.15;
    } // 9 samples * 50ms = 0.45s ballistic freefall (< 0.72G)
    else if (i >= 29 && i < 33) {
      y = 2.45;
    } // Landing impact shock
    samples.push({ x, y, z, t: now + i * 50 });
  }
  return samples;
}

// Case E IMU: Moving/shaking phone without jumping
function makeAccelShaking(count = 40) {
  const samples = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const shake = Math.sin(i * 0.9) * 0.8;
    samples.push({ x: 0.1 + shake, y: 1.0 + shake * 0.7, z: 0.2 + shake * 0.5, t: now + i * 50 });
  }
  return samples;
}

function buildTestMp4(durationSec = 2.5, fps = 30): Uint8Array {
  const totalFrames = Math.round(durationSec * fps);
  const timescale = 600;
  const durationUnits = Math.round(durationSec * timescale);
  const sampleDelta = Math.round(timescale / fps);

  function box(type: string, payload: any) {
    const len = 8 + payload.length;
    const b = Buffer.alloc(len);
    b.writeUInt32BE(len, 0);
    b.write(type, 4, 4, 'ascii');
    payload.copy(b, 8);
    return b;
  }

  const ftypPayload = Buffer.alloc(16);
  ftypPayload.write('mp42', 0, 4, 'ascii');
  ftypPayload.writeUInt32BE(0, 4);
  ftypPayload.write('mp42', 8, 4, 'ascii');
  ftypPayload.write('isom', 12, 4, 'ascii');
  const ftyp = box('ftyp', ftypPayload);

  const mvhdPayload = Buffer.alloc(100);
  mvhdPayload.writeUInt8(0, 0);
  mvhdPayload.writeUInt32BE(timescale, 12);
  mvhdPayload.writeUInt32BE(durationUnits, 16);
  const mvhd = box('mvhd', mvhdPayload);

  const tkhdPayload = Buffer.alloc(84);
  tkhdPayload.writeUInt8(0, 0);
  tkhdPayload.writeUInt32BE(1, 12);
  tkhdPayload.writeUInt32BE(1280 << 16, 76);
  tkhdPayload.writeUInt32BE(720 << 16, 80);
  const tkhd = box('tkhd', tkhdPayload);

  const mdhdPayload = Buffer.alloc(24);
  mdhdPayload.writeUInt8(0, 0);
  mdhdPayload.writeUInt32BE(timescale, 12);
  mdhdPayload.writeUInt32BE(durationUnits, 16);
  const mdhd = box('mdhd', mdhdPayload);

  const hdlrPayload = Buffer.alloc(25);
  hdlrPayload.write('vide', 8, 4, 'ascii');
  const hdlr = box('hdlr', hdlrPayload);

  const sttsPayload = Buffer.alloc(16);
  sttsPayload.writeUInt32BE(1, 4);
  sttsPayload.writeUInt32BE(totalFrames, 8);
  sttsPayload.writeUInt32BE(sampleDelta, 12);
  const stts = box('stts', sttsPayload);

  const stszPayload = Buffer.alloc(12 + totalFrames * 4);
  stszPayload.writeUInt32BE(0, 4);
  stszPayload.writeUInt32BE(totalFrames, 8);
  // Realistic standard H.264 frame sizes: I-frame ~32KB, P-frames ~2.6KB with normal variance
  for (let i = 0; i < totalFrames; i++) {
    const size = i === 0 ? 32000 : 2600 + ((i * 37) % 300);
    stszPayload.writeUInt32BE(size, 12 + i * 4);
  }
  const stsz = box('stsz', stszPayload);

  const stbl = box('stbl', Buffer.concat([stts, stsz]));
  const minf = box('minf', Buffer.concat([stbl]));
  const mdia = box('mdia', Buffer.concat([mdhd, hdlr, minf]));
  const trak = box('trak', Buffer.concat([tkhd, mdia]));
  const moov = box('moov', Buffer.concat([mvhd, trak]));

  return new Uint8Array(Buffer.concat([ftyp, moov]));
}

async function runTests() {
  console.log('================================================================');
  console.log('SPORTLENS COMPUTER VISION & INDEPENDENT IMU ACCEPTANCE SUITE');
  console.log('================================================================\n');

  const mp4Standard = buildTestMp4(2.5, 30);

  // TEST CASE A: FACE ONLY
  console.log('>>> TEST CASE A: FACE ONLY RECORDING');
  const faceSnaps = [
    { base64: makeFaceFrame() },
    { base64: makeFaceFrame() },
    { base64: makeFaceFrame() },
  ];
  const resA = await analyzeVideoJumpKinematics(2.0, 68, makeAccelStatic(), 'file:///test_video.mp4', faceSnaps, mp4Standard);
  console.log('Status: isValid =', resA.isValid, '| Score =', resA.score, '| Height =', resA.jumpHeightCm, 'cm');
  console.log('Gate 2 (Full-Body Framing):', resA.gates![1].passed ? 'PASS' : 'FAIL', '-', resA.gates![1].telemetry);
  console.log('Gate 10 (Metric Calculated):', resA.gates![9].passed ? 'PASS' : 'FAIL', '-', resA.gates![9].telemetry);

  // TEST CASE B: BLANK WALL
  console.log('\n>>> TEST CASE B: BLANK WALL / EMPTY ROOM');
  const wallSnaps = [{ base64: makeWallFrame() }, { base64: makeWallFrame() }];
  const resB = await analyzeVideoJumpKinematics(2.0, 68, makeAccelStatic(), 'file:///test_video.mp4', wallSnaps, mp4Standard);
  console.log('Status: isValid =', resB.isValid, '| Score =', resB.score, '| Height =', resB.jumpHeightCm, 'cm');
  console.log('Gate 1 (Single Athlete):', resB.gates![0].passed ? 'PASS' : 'FAIL', '-', resB.gates![0].telemetry);
  console.log('Gate 10 (Metric Calculated):', resB.gates![9].passed ? 'PASS' : 'FAIL', '-', resB.gates![9].telemetry);

  // TEST CASE C: FULL-BODY STANDING STILL
  console.log('\n>>> TEST CASE C: FULL-BODY STANDING STILL (0 MOVEMENT)');
  const stillSnaps = [
    { base64: makeBodyFrame(120, 160, 0.0) },
    { base64: makeBodyFrame(120, 160, 0.0) },
    { base64: makeBodyFrame(120, 160, 0.0) },
    { base64: makeBodyFrame(120, 160, 0.0) },
    { base64: makeBodyFrame(120, 160, 0.0) },
  ];
  const resC = await analyzeVideoJumpKinematics(2.0, 68, makeAccelStatic(), 'file:///test_video.mp4', stillSnaps, mp4Standard);
  console.log('Status: isValid =', resC.isValid, '| Score =', resC.score, '| Height =', resC.jumpHeightCm, 'cm');
  console.log('Gate 6 (Movement Detected):', resC.gates![5].passed ? 'PASS' : 'FAIL', '-', resC.gates![5].telemetry);
  console.log('Gate 7 (Exercise Events):', resC.gates![6].passed ? 'PASS' : 'FAIL', '-', resC.gates![6].telemetry);
  console.log('Gate 10 (Metric Calculated):', resC.gates![9].passed ? 'PASS' : 'FAIL', '-', resC.gates![9].telemetry);

  // TEST CASE D: GENUINE ATHLETIC VERTICAL JUMP
  console.log('\n>>> TEST CASE D: GENUINE ATHLETIC VERTICAL JUMP');
  const jumpSnaps = [
    // 0.0s - 0.25s: Ready stance
    { base64: makeBodyFrame(120, 160, 0.0) },
    { base64: makeBodyFrame(120, 160, 0.0) },
    { base64: makeBodyFrame(120, 160, 0.0) },
    // 0.3s - 0.45s: Countermovement dip
    { base64: makeBodyFrame(120, 160, -0.04) },
    { base64: makeBodyFrame(120, 160, -0.06) },
    // 0.5s - 0.8s: Takeoff, upward ascent, and airborne flight apex
    { base64: makeBodyFrame(120, 160, 0.07) },
    { base64: makeBodyFrame(120, 160, 0.14) },
    { base64: makeBodyFrame(120, 160, 0.16) },
    { base64: makeBodyFrame(120, 160, 0.15) },
    { base64: makeBodyFrame(120, 160, 0.08) },
    // 0.9s: Landing touchdown
    { base64: makeBodyFrame(120, 160, 0.0) },
    { base64: makeBodyFrame(120, 160, -0.02) },
    // 1.1s: Return to stance
    { base64: makeBodyFrame(120, 160, 0.0) },
  ];
  const resD = await analyzeVideoJumpKinematics(2.5, 68, makeAccelStatic(), 'file:///test_video.mp4', jumpSnaps, mp4Standard);
  console.log('Status: isValid =', resD.isValid, '| Score =', resD.score);
  console.log('Calculated Jump Height:', resD.jumpHeightCm, 'cm');
  console.log('Calculated Flight Time:', resD.flightTimeSec, 's');
  console.log('Calculated Sayers Power:', resD.peakPowerWatts, 'Watts (' + resD.relativePowerWattsPerKg + ' W/kg)');
  console.log('\nAll 10 Verification Gates for Genuine Jump:');
  resD.gates!.forEach((g) => {
    console.log('  Gate ' + g.gateNumber + ' [' + (g.passed ? 'PASS' : 'FAIL') + '] ' + g.title + ': ' + g.telemetry);
  });

  // TEST CASE E: MOVE PHONE AROUND WITHOUT JUMPING
  console.log('\n>>> TEST CASE E: MOVE PHONE AROUND WITHOUT JUMPING (SHAKING)');
  const resE = await analyzeVideoJumpKinematics(2.0, 68, makeAccelShaking(), 'file:///test_video.mp4', stillSnaps, mp4Standard);
  console.log('Status: isValid =', resE.isValid, '| Score =', resE.score, '| Height =', resE.jumpHeightCm, 'cm');
  console.log('Gate 4 (Camera/Device Stable):', resE.gates![3].passed ? 'PASS' : 'FAIL', '-', resE.gates![3].telemetry);
  console.log('Gate 8 (IMU Agreement):', resE.gates![7].passed ? 'PASS' : 'FAIL', '-', resE.gates![7].telemetry);
  console.log('Gate 10 (Metric Calculated):', resE.gates![9].passed ? 'PASS' : 'FAIL', '-', resE.gates![9].telemetry);

  const allPassed =
    resA.isValid === false && resA.score === 0 &&
    resB.isValid === false && resB.score === 0 &&
    resC.isValid === false && resC.score === 0 &&
    resD.isValid === true && resD.score > 0 && resD.jumpHeightCm > 0 &&
    resE.isValid === false && resE.score === 0;

  console.log('\n================================================================');
  console.log('AUDIT VERIFICATION RESULT:', allPassed ? 'ALL 5 ACCEPTANCE CRITERIA PASSED 100%' : 'FAILURES DETECTED');
  console.log('================================================================');
}

runTests();
