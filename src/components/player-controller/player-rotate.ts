import {Component} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {typename} from '../../constants.js';
import {PlayerController} from './player-controller.js';
import {RotationType} from './enums/RotationType.js';

export class PlayerRotate extends Component {
    static TypeName = typename('player-rotate');
    private static rotationTypeMapping = ['Snap', 'Smooth'];

    @property.enum(
        PlayerRotate.rotationTypeMapping,
        PlayerRotate.rotationTypeMapping[RotationType.Snap]
    )
    rotationType = PlayerRotate.rotationTypeMapping[RotationType.Snap];
    // Tooltip("Set to false to skip Update")]
    // public bool AllowInput = true;
    // [Tooltip("Used to determine whether to turn left / right. This can be an X Axis on the thumbstick, for example. -1 to snap left, 1 to snap right.")]
    // public List<InputAxis> inputAxis = new List<InputAxis>() { InputAxis.RightThumbStickAxis };
    // [Tooltip("Unity Input Action used to rotate the player")]
    // public InputActionReference RotateAction;
    // [Header("Smooth / Snap Turning")]
    // [Tooltip("Snap rotation will rotate a fixed amount of degrees on turn. Smooth will linearly rotate the player.")]
    // public RotationMechanic RotationType = RotationMechanic.Snap;
    // [Header("Snap Turn Settings")]
    // [Tooltip("How many degrees to rotate if RotationType is set to 'Snap'")]
    // public float SnapRotationAmount = 45f;
    // [Tooltip("Thumbstick X axis must be >= this amount to be considered an input event")]
    // public float SnapInputAmount = 0.75f;
    // [Header("Smooth Turn Settings")]
    // [Tooltip("How fast to rotate the player if RotationType is set to 'Smooth'")]
    // public float SmoothTurnSpeed = 40f;
    // [Tooltip("Thumbstick X axis must be >= this amount to be considered an input event")]
    // public float SmoothTurnMinInput = 0.1f;
    private playerController!: PlayerController;
    start(): void {
        const tempPlayerController = this.object.getComponent(PlayerController);
        if (!tempPlayerController) {
            throw new Error(
                `player-controller(${this.object.name}): object does not have a PlayerController. This is required.`
            );
        }
        this.playerController = tempPlayerController;
    }
}
