# WE-IL: Documentation

## Interactor / Interactable

The interactor

## Single-Hand

TODO

## Single-Hand

TODO


## Player Controller

At the root of the xr rig is a `Player` object. The player object has a `wlei:player-controller` component and a `physx` component.  

XR Rig:
Player(Object)
| wlei:player-controller
| physx
| wlei:locomotion-selector
| wlei:smooth-locomotion
| wlei:teleport-locomotion
| wlei:player-rotate
| wlei:input-bridge
+ TrackedSpace (Object)
  | player-height
  + 

### wlei:player-controller

This is the heart of the player controller system. It uses physx to move the player around. Based on preferences the player