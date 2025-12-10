import {Component, InputComponent, Object3D, property} from '@wonderlandengine/api';
import {vec3} from 'gl-matrix';

import {componentError} from '../utils/wle.js';

/**
 * Typename for a `PlayerControllerInput` component.
 *
 * Use this to create your own input component that can
 * be retrieved by {@link PlayerController}:
 *
 * ```ts
 * import {PlayerControllerInput, PlayerControllerInputTypename} fromn '@wonderlandengine/interaction';
 *
 * export class CustomPlayerInput implements PlayerControllerInput {
 *     static TypeName = PlayerControllerInputTypename;
 *     ...
 * }
 * ```
 */
export const PlayerControllerInputTypename = 'player-controller-input';

/**
 * Defines an interface for bridging various input methods into a unified control scheme.
 *
 * The `PlayerControllerInput` serves as an abstraction layer that enables an application to
 * process input data from different sources such as keyboards, game controllers,
 * and VR controllers in a consistent manner. Implementations of this interface should
 * provide mechanisms to interpret and translate these diverse inputs into a set
 * of standardized movement and rotation vectors that the application can easily use
 * for navigation and interaction within a 3D environment.
 *
 * @example
 * ```js
 * export class CustomInput extends Component implements PlayerControllerInput {
 *   static TypeName = InputBridgeTypename;
 *
 *   \/** @override *\/
 *   getRotationAxis(out: vec3) {
 *       // Always rotate by 10 degrees around the. You can input your own values here,
 *       // coming from a keyboard, the network, etc...
 *       out[1] = 10;
 *       return out;
 *   }
 *
 *   \/** @override *\/
 *   getMovementAxis(out: vec3) {
 *       // Always move to the right. You can input your own values here,
 *       // coming from a keyboard, the network, etc...
 *       out[0] = 1;
 *       return out;
 *   }
 *}
 *```
 */
export interface PlayerControllerInput extends Component {
    /**
     * Get the rotation axis.
     *
     * @param out The destination array.
     * @returns The `out` parameter;
     */
    getRotationAxis(out: vec3): vec3;
    /**
     * Get the movement axis.
     *
     * @param out The destination array.
     * @returns The `out` parameter;
     */
    getMovementAxis(out: vec3): vec3;
}

enum Direction {
    Up = 0,
    Down = 1,
    Left = 2,
    Right = 3,
}

/**
 * KeyMap for Keyboard Inputs.
 * If keys need to change or be added in the future, change here.
 *
 * @remarks
 * Because KeyboardEvent.code is used there is no need to worry about keyboard layout.
 * For example: KeyW is always Up, no matter if the keyboard is QWERTY or AZERTY.
 */
const KeyToDirection: {[key: string]: Direction} = {
    ArrowUp: Direction.Up,
    KeyW: Direction.Up,
    ArrowRight: Direction.Right,
    KeyD: Direction.Right,
    ArrowDown: Direction.Down,
    KeyS: Direction.Down,
    ArrowLeft: Direction.Left,
    KeyA: Direction.Left,
};

/**
 * A default implementation of that handles input from:
 * - Keyboard
 * - VR controller
 */
export class DefaultPlayerControllerInput
    extends Component
    implements PlayerControllerInput
{
    static TypeName = PlayerControllerInputTypename;

    @property.bool(true)
    keyboard = true;

    /* VR gamepads */

    @property.bool(true)
    vr = true;

    @property.object({required: true})
    leftControlObject!: Object3D;

    @property.object({required: true})
    rightControlObject!: Object3D;

    @property.float(0.1)
    deadzoneThreshold = 0.1;

    /* Keyboard private attributes */

    private _keyPress = [false, false, false, false];

    /* VR gamepad private attributes */

    private _inputLeft!: InputComponent;
    private _inputRight!: InputComponent;

    private _direction = vec3.create();
    private _rotation = vec3.create();

    /** @override */
    onActivate(): void {
        if (this.keyboard) {
            /** @todo: Allow user to select dom element to listen to */
            window.addEventListener('keydown', this._onKeyPressed);
            window.addEventListener('keyup', this._onKeyReleased);
        }

        if (!this.vr) return;

        const left = this.leftControlObject.getComponent(InputComponent);
        if (!left) {
            throw new Error(
                componentError(this, 'leftControlObject does not have a InputComponent')
            );
        }
        this._inputLeft = left;

        const right = this.rightControlObject.getComponent(InputComponent);
        if (!right) {
            throw new Error(
                componentError(this, 'rightControlObject does not have a InputComponent')
            );
        }
        this._inputRight = right;
    }

    /** @override */
    onDeactivate(): void {
        window.removeEventListener('keydown', this._onKeyPressed);
        window.removeEventListener('keyup', this._onKeyReleased);
    }

    /** @override */
    update() {
        vec3.zero(this._direction);
        if (this._keyPress[Direction.Up]) this._direction[2] -= 1.0;
        if (this._keyPress[Direction.Down]) this._direction[2] += 1.0;
        if (this._keyPress[Direction.Left]) this._direction[0] -= 1.0;
        if (this._keyPress[Direction.Right]) this._direction[0] += 1.0;

        vec3.zero(this._rotation);

        const axesLeft = this._inputLeft.xrInputSource?.gamepad?.axes;
        if (
            axesLeft &&
            (Math.abs(axesLeft[2]) > this.deadzoneThreshold ||
                Math.abs(axesLeft[3]) > this.deadzoneThreshold)
        ) {
            this._direction[0] = axesLeft[2];
            this._direction[2] = axesLeft[3];
        }

        const axesRight = this._inputRight.xrInputSource?.gamepad?.axes;
        if (
            axesRight &&
            (Math.abs(axesRight[2]) > this.deadzoneThreshold ||
                Math.abs(axesRight[3]) > this.deadzoneThreshold)
        ) {
            this._rotation[0] = axesRight[2];
            this._rotation[2] = axesRight[3];
        }
    }

    /** @override */
    getRotationAxis(out: vec3) {
        vec3.copy(out as vec3, this._rotation);
        return out;
    }

    /** @override */
    getMovementAxis(out: vec3) {
        vec3.copy(out as vec3, this._direction);
        return out;
    }

    /** @hidden */
    private _onKeyPressed = (input: KeyboardEvent) => {
        const direction = KeyToDirection[input.code];
        if (direction !== undefined) {
            this._keyPress[direction] = true;
        }
    };

    /** @hidden */
    private _onKeyReleased = (input: KeyboardEvent) => {
        const direction = KeyToDirection[input.code];
        if (direction !== undefined) {
            this._keyPress[direction] = false;
        }
    };
}
