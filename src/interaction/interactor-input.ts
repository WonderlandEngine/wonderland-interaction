import {
    Component,
    Emitter,
    InputComponent,
    Object3D,
    property,
    Scene,
} from '@wonderlandengine/api';
import {componentError, enumStringKeys} from '../utils/wle.js';

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
export const InteractorInputTypename = 'interactor-input';

/**
 * Defines an interface for bridging inputs with {@link Interactor}.
 *
 * For custom inputs, implement this interface, e.g.,
 *
 * @example
 * ```js
 * export class CustomInput extends Component implements InteractorInput {
 *     static TypeName = InteractorInputTypename;
 *
 *     onGrabStart: Emitter;
 *     onGrabEnd: Emitter;
 *
 *     update() {
 *         // Notify `onGrabStart` and `onGrabEnd`.
 *         // Could be an event from the network, anything.
 *     }
 *
 *     \/** @override *\/
 *     get xrPose(): XRPose {
 *         return this._xrPose;
 *     }
 * }
 * ```
 *
 * The custom bridge doesn't need to be a Wonderland Engine component.
 */
export interface InteractorInput extends Component {
    /** Notify once the grab must start. */
    onGrabStart: Emitter;
    /** Notify once the grab must end. */
    onGrabEnd: Emitter;
    /** Current controller XR pose. */
    get xrPose(): XRPose | null;
}

/** Semantic mapping for XR controller button. */
export enum XRButton {
    Trigger = 0,
    Grip,
    Joystick,
    PrimaryButton,
    SecondaryButton,
}
/** List of string keys for {@link XRButton}. */
export const XRButtonNames = enumStringKeys(XRButton);

/**
 * Binding for XR buttons.
 *
 * This is a direct mapping to `buttons`:
 * https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/buttons
 */
enum XRBinding {
    Trigger = 0,
    Grip = 1,
    Joystick = 2,
    PrimaryButton = 4,
    SecondaryButton = 5,
}
const Mapping: number[] = XRButtonNames.map((n) => XRBinding[n]);

/**
 * Default inputs for {@link Interactor}.
 *
 * Currently supports:
 * - VR controllers
 *
 * For fully custom inputs, derive {@link InteractorInput} instead.
 */
export class DefaultInteractorInput extends Component implements InteractorInput {
    static TypeName = InteractorInputTypename;

    /* VR gamepads */

    /** Object with a native input component.*/
    @property.object({required: true})
    inputObject!: Object3D;

    @property.enum(XRButtonNames, XRButton.Grip)
    grab = XRButton.Grip;

    /* Public attributes */

    onGrabStart = new Emitter();
    onGrabEnd = new Emitter();

    /* Private attributes */

    private _input!: InputComponent;
    private _grabPressed = false;

    private _xrPose: XRPose | null = null;

    /** @hidden */
    private readonly _onPreRender = () => {
        this._xrPose = null;

        const source = this._input.xrInputSource;
        if (!source || !source.gripSpace) return;

        const xr = this.engine.xr!;
        const referenceSpace =
            xr.referenceSpaceForType('local-floor') ?? xr.referenceSpaceForType('local');
        if (!referenceSpace) return;

        const pose = xr.frame!.getPose(source.gripSpace, referenceSpace);
        this._xrPose = pose ?? null;
    };

    getInputSourceXR() {
        return this._input.xrInputSource;
    }

    /** @override */
    onActivate(): void {
        const input = this.inputObject.getComponent(InputComponent);
        if (!input) {
            throw new Error(
                componentError(this, 'inputObject does not have a InputComponent')
            );
        }
        this._input = input;

        const scene = this.scene as Scene;
        scene.onPreRender.add(this._onPreRender);
    }

    onDeactivate(): void {
        const scene = this.scene as Scene;
        scene.onPreRender.remove(this._onPreRender);
    }

    /** @override */
    update() {
        const previous = this._grabPressed;

        const gamepad = this._input.xrInputSource?.gamepad;
        if (gamepad) {
            const remapped = Mapping[this.grab];
            const button = gamepad.buttons[remapped];
            this._grabPressed = button?.pressed ?? false;
        }

        if (!previous && this._grabPressed) {
            this.onGrabStart.notify();
        } else if (previous && !this._grabPressed) {
            this.onGrabEnd.notify();
        }
    }

    get xrPose() {
        return this._xrPose;
    }
}
