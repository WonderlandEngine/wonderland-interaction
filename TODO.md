# releases
V0.1 (first public release): 
    ✔ Physx required @done
    ☐ Grab, throw in VR
    ☐ Distance Grab
    ☐ 2 handed
    PlayerController:
      ✔ Mouse/WASD + VR Controller @done
      ✔ Teleport @done
      ✔ Smooth locomotion @done
      ✔ Snap rotate @done
    ☐ Documentation

# ToDo List

Grabbing:
    ☐ Disable distance grabbing when a double-hand grabbable is only grabbed with one hand
    ☐ Emulate angular velocity
    ☐ Improve throwing speed uniformity between emulated and native
    ☐ Find a way to improve performance for collision check (distance grab)
    ☐ Interaction mapping for selection / shoot etc...

Player controller:
    ✔ General setup for player controller based on physx @done
    ✔ Prevent from moving through walls @done
    ✔ Prevent from putting your head into the wall (fade to black) @done
    different ways of movement:
        ✔ Smooth locomotion @done
        ✔ Teleport @done(23-11-15 10:52)
        ☐ make the ways of movenent work all at the same time
    different ways of rotating:
        ☐ smooth rotation
        ✔ snap rotation @done
    input support for:
        ✔ VR controllers @done
        ✔ Keyboard @done
        ☐ Mouse
        ☐ Touch
        ☐ Gamepad

Templates:
    ☐ Template project based on 'default VR', but with this packages set up.
    ☐ Documentation on how to use the template

### Ideas:
* Poke interaction
* Climbing
* Hand poses
* Prevent objects from passing through eachother
* Moving platform
* Interact with objects (Cursor+Input), including icons etc
  * So that this could be the base for other libraries with weapons, doors/hinges and UI
* Templates (With CLI to install?)


