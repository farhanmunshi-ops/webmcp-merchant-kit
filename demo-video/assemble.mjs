/**
 * Assembles the final MP4 with production polish: per-scene eased push-in zooms
 * (zoompan), stat-callout lower-thirds (drawtext), last-frame freeze when
 * narration outruns footage, narration mux, concat.
 */
import { execFileSync } from "node:child_process";
import { statSync, writeFileSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";

const DIR = new URL("./", import.meta.url).pathname;
const FONT = "/System/Library/Fonts/Helvetica.ttc";

// zoom: push toward (cx, cy) reaching `max` ~80% through the scene.
// call: [text, tStart, tEnd] lower-third callout.
const SPEC = {
  s0_cold:  { zoom: { max: 1.06, cx: 0.51, cy: 0.54 }, call: ["$49.00 saved · live freight included", 3.0, 10.5] },
  s1_title: {},
  s2_pdp:   { zoom: { max: 1.06, cx: 0.50, cy: 0.44 }, call: ["Answered from the page itself · zero network", 8.0, 14.0] },
  s3_desk:  { zoom: { max: 1.06, cx: 0.51, cy: 0.52 }, call: ["$49.00 saved (12.7%)", 27.0, 34.5] },
  s4_file:  { zoom: { max: 1.06, cx: 0.49, cy: 0.56 }, call: ["Human-verified · exact freight · nothing auto-charged", 9.0, 17.0] },
  s5_outro: {},
};
const SCENES = Object.keys(SPEC);

const ff = (args) => execFileSync(ffmpegPath, ["-y", "-loglevel", "error", ...args], { stdio: ["ignore", "inherit", "inherit"] });
const probe = (file) => {
  try { execFileSync(ffmpegPath, ["-i", file], { stdio: ["ignore", "pipe", "pipe"] }); return 0; }
  catch (e) {
    const m = String(e.stderr).match(/Duration: (\d+):(\d+):([\d.]+)/);
    return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
  }
};

const parts = [];
for (const name of SCENES) {
  const v = `${DIR}scenes/${name}.webm`;
  const a = `${DIR}audio/${name}.wav`;
  const vd = probe(v);
  const ad = (statSync(a).size - 44) / 48000;
  const target = Math.max(vd, ad + 0.8);
  const pad = Math.max(0, target - vd);
  const spec = SPEC[name];

  const chain = ["fps=30"];
  if (spec.zoom) {
    const { max, cx, cy } = spec.zoom;
    const rate = ((max - 1) / (0.8 * vd * 30)).toFixed(7);
    chain.push(
      `zoompan=z='min(1+${rate}*on,${max})'` +
      `:x='${cx}*iw-(iw/zoom/2)':y='${cy}*ih-(ih/zoom/2)':d=1:fps=30:s=1920x1080`);
  }
  if (spec.call) {
    const [text, t1, t2] = spec.call;
    chain.push(
      `drawtext=fontfile=${FONT}:expansion=none:text='${text}':fontsize=46:fontcolor=white` +
      `:box=1:boxcolor=black@0.55:boxborderw=22:x=(w-text_w)/2:y=h-160` +
      `:enable='between(t,${t1},${t2})'`);
  }
  chain.push(`tpad=stop_mode=clone:stop_duration=${pad.toFixed(2)}`, "scale=1920:1080");

  const out = `${DIR}scenes/${name}.mp4`;
  ff([
    "-i", v, "-i", a,
    "-filter_complex", `[0:v]${chain.join(",")}[v];[1:a]aresample=44100,apad[aa]`,
    "-map", "[v]", "-map", "[aa]",
    "-t", target.toFixed(2),
    "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k",
    out,
  ]);
  parts.push(out);
  console.log(name, `video ${vd.toFixed(1)}s, narration ${ad.toFixed(1)}s -> ${target.toFixed(1)}s`);
}

writeFileSync(`${DIR}concat.txt`, parts.map((p) => `file '${p}'`).join("\n"));
ff(["-f", "concat", "-safe", "0", "-i", `${DIR}concat.txt`, "-c", "copy", `${DIR}agent-quote-desk-demo.mp4`]);
console.log("FINAL:", `${DIR}agent-quote-desk-demo.mp4`, probe(`${DIR}agent-quote-desk-demo.mp4`).toFixed(1) + "s");
