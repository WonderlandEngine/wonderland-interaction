import {Component, InputComponent, Object3D, PhysXComponent} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {typename} from '../constants.js';

/**
 * This component is attached to the player object and is responsible for
 * controlling the player's movement.
 *
 * It needs to have a physx component attached to it. And be on the root of the
 * player hierarchy.
 */
export class PlayerController extends Component {
    static TypeName = typename('player-controller');

    private physxComponent!: PhysXComponent;

    init() {}

    start() {
        const tempPhysx = this.object.getComponent(PhysXComponent);
        if (!tempPhysx) {
            throw new Error(
                `player-controller(${this.object.name}): object does not have a Physx`
            );
        }
        this.physxComponent = tempPhysx;
    }

    update(dt: number) {}

    move() {}

    rotate() {}
}

export class SmoothLocomotion extends Component {
    static TypeName = typename('smooth-locomotion');

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

export class TeleportLocomotion extends Component {
    static TypeName = typename('teleport-locomotion');

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

/**
 * Pushes the player backwards when their head collides with a wall / object
 */
export class HeadCollissionMove extends Component {
    static TypeName = typename('head-collission-move');
}

/**
 * Fade to black when the player's head collides with a wall / object
 */
export class HeadCollissionFade extends Component {
    static TypeName = typename('head-collission-fade');
}

/**
 * A proxy for handling input from various input providers, such as keyboard, mouse
 * VR controllers or game controllers.
 */
export class InputBridge extends Component {
    static TypeName = typename('input-bridge');

    /**
     * The input provider to use for this bridge
     */
    @property.object({required: true})
    leftHandInput!: Object3D;

    leftHandInputComponent?: InputComponent | null;

    start(): void {
        this.leftHandInputComponent = this.leftHandInput.getComponent(InputComponent);
    }
}

/**
 * The type of rotation to use when turning the player
 */
export enum RotationType {
    Snap,
    Smooth,
}

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

/**
 * The type of locomotion to use for the player
 */
export enum LocomotionType {
    /**
     * Teleportation locomotion is the most comfortable for most people.
     */
    Teleport,
    /**
     * Smooth locomotion is the most immersive, but can cause motion sickness.
     */
    Smooth,
    /**
     * None means that the player cannot move using the controllers. This is useful for
     * experiences that use room-scale VR.
     */
    None,
}

/**
 * A component that allows easy selecting the type of locomotion to use.
 */
export class LocomotionSelector extends Component {
    static TypeName = typename('locomotion-selector');

    private static locomotionTypeMapping = ['Teleport', 'SmoothLocomotion', 'None'];

    @property.enum(
        LocomotionSelector.locomotionTypeMapping,
        LocomotionSelector.locomotionTypeMapping[LocomotionType.Teleport]
    )
    locomotionType = LocomotionSelector.locomotionTypeMapping[LocomotionType.Teleport];

    private smoothLocomotion?: SmoothLocomotion | null;
    private teleportLocomotion?: TeleportLocomotion | null;

    start(): void {
        const tempSmoothLocomotion = this.object.getComponent(SmoothLocomotion);
        if (!tempSmoothLocomotion) {
            console.warn(
                `player-controller(${this.object.name}): object does not have a SmoothLocomotion. To use smooth locomotion, make sure the component is on the ${this.object.name} object.`
            );
        }
        this.smoothLocomotion = tempSmoothLocomotion;

        const tempTeleportLocomotion = this.object.getComponent(TeleportLocomotion);
        if (!tempTeleportLocomotion) {
            console.warn(
                `player-controller(${this.object.name}): object does not have a TeleportLocomotion. To use teleport locomotion, make sure the component is on the ${this.object.name} object.`
            );
        }
        this.teleportLocomotion = tempTeleportLocomotion;
    }

    private setLocomotion() {
        this.toggleTeleport(
            this.locomotionType ===
                LocomotionSelector.locomotionTypeMapping[LocomotionType.Teleport]
        );
        this.toggleSmoothLocomotion(
            this.locomotionType ===
                LocomotionSelector.locomotionTypeMapping[LocomotionType.Smooth]
        );
    }

    toggleSmoothLocomotion(enabled: boolean) {
        if (this.smoothLocomotion) {
            this.smoothLocomotion.active = enabled;
        } else {
            console.warn(
                `locomotion-selector(${this.object.name}) doesn't smoothLocomotion set.`
            );
        }
    }

    toggleTeleport(enabled: boolean) {
        if (this.teleportLocomotion) {
            this.teleportLocomotion.active = enabled;
        } else {
            console.warn(
                `locomotion-selector(${this.object.name}) doesn't teleportLocomotion set.`
            );
        }
    }
}
