import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { ANNOUNCER_CALLS } from "../js/announcer-director.js";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const apiKey = process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY;
const requested = process.argv.slice(2);
const runVoices = requested.includes("--voices") || requested.includes("--all");
const musicFlagIndex = requested.indexOf("--music");
const requestedMusic = musicFlagIndex >= 0 ? requested[musicFlagIndex + 1] : null;

if (!apiKey) {
  console.error("ELEVENLABS_API_KEY is required. Run this script through the local secret broker.");
  process.exit(1);
}

const MUSIC_TRACKS = Object.freeze({
  street: {
    title: "Park After Dark",
    prompt: "Original instrumental loop for a nocturnal outdoor street basketball duel. 96 BPM gritty boom-bap drums, rubbery sub bass, sparse muted guitar chops, subtle chain-link percussion, and confident head-to-head energy. Raw but polished, contemporary arcade sports game soundtrack. No vocals, no spoken words, no recognizable samples. Keep the melody sparse and leave space for basketball sound effects and an announcer. Loop-friendly ending with controlled dynamics.",
    lengthMs: 40000,
  },
  threePoint: {
    title: "Arc Pressure",
    prompt: "Original instrumental loop for a timed three-point basketball contest under arena lights. 122 BPM electro hip-hop, precise ticking hi-hats, pulsing synth arpeggio, tight kick and snare, subtle risers, and focused escalating pressure. Energetic without becoming frantic. No vocals, no spoken words, no recognizable samples. Leave space for buzzer, ball, and announcer effects. Loop-friendly ending with controlled dynamics.",
    lengthMs: 40000,
  },
  team: {
    title: "Night Tactics",
    prompt: "Original instrumental loop for tactical three-on-three half-court basketball at night. 102 BPM dark modern hip-hop, crisp percussion, tense synth pulses, restrained brass stabs, deep bass, and smart stop-start energy that feels strategic and competitive. No vocals, no spoken words, no recognizable samples. Leave room for gameplay and broadcast commentary. Loop-friendly ending with controlled dynamics.",
    lengthMs: 40000,
  },
  duos: {
    title: "Two-Man Current",
    prompt: "Original instrumental loop for fast two-on-two half-court basketball. 94 BPM nimble funk-infused hip-hop, syncopated bass, dry rim-click percussion, warm electric keys, and call-and-response synth phrases suggesting teamwork and counters. Competitive, agile, and stylish. No vocals, no spoken words, no recognizable samples. Keep the arrangement uncluttered for game sound effects. Loop-friendly ending with controlled dynamics.",
    lengthMs: 40000,
  },
  fives: {
    title: "Full Court Voltage",
    prompt: "Original instrumental loop for full-court five-on-five basketball with a premium night broadcast feel. 110 BPM cinematic hip-hop, stomping arena drums, massive but clean sub bass, short brass-synth swells, pulsing strings, and stadium-scale momentum. Prestigious and intense, not melodramatic. No vocals, no spoken words, no recognizable samples. Leave room for crowd, ball, whistle, and announcer audio. Loop-friendly ending with controlled dynamics.",
    lengthMs: 40000,
  },
  practice: {
    title: "Open Gym Focus",
    prompt: "Original instrumental loop for a solo late-night basketball practice gym. 84 BPM low-fatigue lo-fi neo-soul, warm electric piano, soft hip-hop drums, rounded bass, airy pads, and a focused meditative groove. Calm confidence for repeated shooting and dribbling reps. No vocals, no spoken words, no recognizable samples. Keep transients gentle and leave space for ball sounds. Loop-friendly ending with controlled dynamics.",
    lengthMs: 40000,
  },
});

const VOICES = Object.freeze({
  announcer: {
    id: "SA7eD52NRr8WAehitVt1",
    name: "Tyler Cruz - Cool Energetic DJ",
  },
  pa: {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah - Mature, Reassuring, Confident",
  },
});

const PA_EVENTS = new Set(["tip", "overtime", "final_minute", "game_over", "camera"]);
const HIGH_EVENTS = new Set(["dunk", "block", "ankle_break", "overtime", "game_over"]);

async function requestAudio(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    throw new Error(`ElevenLabs request failed (${response.status}): ${detail}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function writeAtomic(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.partial`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

async function generateMusic(key) {
  const track = MUSIC_TRACKS[key];
  if (!track) throw new RangeError(`Unknown music key: ${key}`);
  console.log(`Generating music: ${key} / ${track.title}`);
  const bytes = await requestAudio(
    "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128",
    {
      prompt: track.prompt,
      music_length_ms: track.lengthMs,
      model_id: "music_v1",
      force_instrumental: true,
    },
  );
  await writeAtomic(join(root, "assets", "audio", "music", `${key}.mp3`), bytes);
  console.log(`Saved music: ${key} (${bytes.length} bytes)`);
}

async function generateVoices() {
  for (const [event, lines] of Object.entries(ANNOUNCER_CALLS)) {
    const role = PA_EVENTS.has(event) ? "pa" : "announcer";
    const voice = VOICES[role];
    for (let index = 0; index < lines.length; index += 1) {
      const clip = `${event}-${index + 1}`;
      const delivery = role === "pa"
        ? "[confident] "
        : HIGH_EVENTS.has(event)
          ? "[excited] "
          : "[engaging] ";
      console.log(`Generating voice: ${clip} / ${role}`);
      const bytes = await requestAudio(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}?output_format=mp3_44100_128`,
        {
          text: `${delivery}${lines[index]}`,
          model_id: "eleven_v3",
        },
      );
      await writeAtomic(join(root, "assets", "audio", "voices", `${clip}.mp3`), bytes);
    }
  }
}

async function fileMetadata(relativePath) {
  const absolutePath = join(root, ...relativePath.split("/"));
  const bytes = await readFile(absolutePath);
  const info = await stat(absolutePath);
  return {
    path: relativePath,
    bytes: info.size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function writeManifest() {
  const music = {};
  for (const [key, track] of Object.entries(MUSIC_TRACKS)) {
    try {
      music[key] = {
        title: track.title,
        prompt: track.prompt,
        model: "music_v1",
        length_ms: track.lengthMs,
        ...(await fileMetadata(`assets/audio/music/${key}.mp3`)),
      };
    } catch {
      // Keep partial generation runs useful without claiming missing files exist.
    }
  }
  const voices = {};
  for (const [event, lines] of Object.entries(ANNOUNCER_CALLS)) {
    const role = PA_EVENTS.has(event) ? "pa" : "announcer";
    for (let index = 0; index < lines.length; index += 1) {
      const clip = `${event}-${index + 1}`;
      try {
        voices[clip] = {
          text: lines[index],
          role,
          voice_id: VOICES[role].id,
          voice_name: VOICES[role].name,
          model: "eleven_v3",
          ...(await fileMetadata(`assets/audio/voices/${clip}.mp3`)),
        };
      } catch {
        // Keep partial generation runs useful without claiming missing files exist.
      }
    }
  }
  const manifest = {
    provider: "ElevenLabs",
    generated_at: new Date().toISOString(),
    license_note: "Generated specifically for NOVA COURT through the project owner's ElevenLabs account. No downloaded music, samples, celebrity voices, or imitated performers were requested.",
    music,
    voices,
  };
  await mkdir(join(root, "assets", "audio"), { recursive: true });
  await writeFile(join(root, "assets", "audio", "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Updated manifest (${Object.keys(music).length} music tracks, ${Object.keys(voices).length} voice clips)`);
}

if (requestedMusic) await generateMusic(requestedMusic);
if (runVoices) await generateVoices();
if (!requestedMusic && !runVoices) {
  console.error("Choose --music <street|threePoint|team|duos|fives|practice>, --voices, or --all.");
  process.exit(1);
}
await writeManifest();
