# Procedural basketball visual review

These captures use the production `createBasketballMesh` factory shared by the
live game and Player Model Lab.

| Screenshot | Review pose | Visual QA |
| --- | --- | --- |
| `basketball-front.png` | `player-lab.html?subject=basketball&view=front` | Confirms the two great-circle channels and paired fitted curves meet cleanly. |
| `basketball-three-quarter.png` | `player-lab.html?subject=basketball&view=three-quarter` | Confirms channel continuity around the sphere and readable pebbled rubber. |
| `basketball-profile.png` | `player-lab.html?subject=basketball&view=profile` | Confirms the curved channel remains continuous away from the fitted front view. |
| `basketball-open-gym-integration.png` | Open Gym, follow camera | Confirms the procedural ball is attached to the user's live dribble state in gameplay. |

The isolated review scene held 60 FPS after settling with two draw calls,
6,088 rendered triangles, and four loaded textures. The ball itself remains one
draw call and uses independent albedo, bump, and roughness maps.
