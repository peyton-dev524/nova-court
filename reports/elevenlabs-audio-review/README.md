# NOVA COURT ElevenLabs audio review

Review date: 2026-07-28

The existing presentation already had a strong cyan/orange night-broadcast identity, but every mode shared one procedural 94 BPM loop and browser speech synthesis. The screenshots below established the new audio direction before generation.

| Screen / mode | Visual read | Music direction | Voice direction |
| --- | --- | --- | --- |
| [Main menu](./01-main-menu.png) | Sparse, nocturnal, confident, premium street broadcast | Use Park Duel's restrained boom-bap identity as the default menu bed | Arena PA for the opening line; avoid constant chatter |
| [Mode select](./02-mode-select.png) | Six clearly differentiated run formats | Preview the selected mode's loop so the cards feel like distinct programming | No new speech on card hover/select; UI ticks stay concise |
| [Park Duel](./03-park-duel.png) | Outdoor cage, one-on-one swagger, close crowd | 96 BPM gritty boom bap, sub bass, muted guitar, chain-link accents | Energetic modern play-by-play; short calls that leave room for dribbles |
| [Arc Run](./04-arc-run.png) | Timed solo pressure, rack progression, clinical arena | 122 BPM electro hip-hop with ticking hats and rising pulse | PA handles start/final state; announcer celebrates makes without overfilling the timer |
| [Night Threes](./05-night-threes.png) | Tactical half court, six bodies, broadcast camera | 102 BPM dark tactical hip-hop with tense synth pulses and restrained brass | Play-by-play emphasizes spacing, blocks, steals, and momentum |
| NOVA Duos | Same half-court language with more space and two-man counters | 94 BPM nimble funk-hop, syncopated bass, warm keys, call-and-response synth | Keep calls conversational and selective so teammate actions read clearly |
| [NOVA Five](./06-nova-five.png) | Full-court scale and regulation clock | 110 BPM cinematic arena hip-hop with larger drums and broadcast prestige | Biggest play-by-play energy; PA owns game-state and closing calls |
| [Open Gym](./07-open-gym.png) | Solo repetition, low pressure, skill-lab focus | 84 BPM low-fatigue lo-fi neo-soul with warm keys and soft drums | Minimal PA introduction; event calls remain available but naturally sparse |

## Implemented asset set

- Six local, mode-specific 40-second instrumental MP3 loops.
- Thirty local, caption-synchronized voice clips covering every announcer line.
- Energetic play-by-play and calmer arena-PA roles.
- Lazy decoding, crossfaded mode changes, looping playback, unified mute/volume/compression, and procedural fallback music.
- Browser speech synthesis is retained only when recorded audio is unavailable in development or tests.

Exact provider metadata, prompts, voice IDs, file sizes, and SHA-256 hashes are stored in [`assets/audio/manifest.json`](../../assets/audio/manifest.json).
