import {Component} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {SmoothLocomotion} from './smooth-locomotion.js';
import {TeleportLocomotion} from './teleport-locomotion.js';
import {LocomotionType} from './enums/LocomotionType.js';

/**
 * Manages the selection and activation of different locomotion methods for a player.
 *
 * The `LocomotionSelector` class provides an interface for switching between various
 * locomotion types, such as teleportation and smooth locomotion, ensuring that the
 * player can interact with the virtual environment in a preferred manner. It toggles
 * between the available locomotion components on the player object based on the
 * selected locomotion type.
 *
 * @example
 * ```js
 * const locomotionSelector = playerObject.getComponent(LocomotionSelector);
 * locomotionSelector.locomotionType = LocomotionType.Teleport; // Sets teleportation as the active locomotion method.
 * ```
 */
export class LocomotionSelector extends Component {
    static TypeName = 'locomotion-selector';

    private static locomotionTypeMapping = ['Teleport', 'SmoothLocomotion', 'None'];

    @property.enum(
        LocomotionSelector.locomotionTypeMapping,
        LocomotionSelector.locomotionTypeMapping[LocomotionType.Teleport]
    )
    locomotionType = LocomotionType.Teleport;

    // TODO TK: This is the proposed way to do it, but it doesn't work yet.
    //     I'm keeping it here for now so we can continue development and revisit it later.
    // get locomotionType(): LocomotionType {
    //     return this._locomotionType;
    // }
    // set locomotionType(value: LocomotionType) {
    //     if (this._locomotionType === value) {
    //         return;
    //     }
    //     this._locomotionType = value;
    //     this.setLocomotion();
    // }

    // private _locomotionType = LocomotionType.Teleport;

    private _smoothLocomotion?: SmoothLocomotion | null;
    private _teleportLocomotion?: TeleportLocomotion | null;

    public get isKinematic(): boolean {
        return this.locomotionType === LocomotionType.Teleport;
    }

    start(): void {
        const tempSmoothLocomotion = this.object.getComponent(SmoothLocomotion);
        if (!tempSmoothLocomotion) {
            console.warn(
                `player-controller(${this.object.name}): object does not have a SmoothLocomotion. To use smooth locomotion, make sure the component is on the ${this.object.name} object.`
            );
        }
        this._smoothLocomotion = tempSmoothLocomotion;

        const tempTeleportLocomotion = this.object.getComponent(TeleportLocomotion);
        if (!tempTeleportLocomotion) {
            console.warn(
                `player-controller(${this.object.name}): object does not have a TeleportLocomotion. To use teleport locomotion, make sure the component is on the ${this.object.name} object.`
            );
        }
        this._teleportLocomotion = tempTeleportLocomotion;

        this.setLocomotion();
    }

    private setLocomotion() {
        this.toggleTeleport(this.locomotionType === LocomotionType.Teleport);
        this.toggleSmoothLocomotion(this.locomotionType === LocomotionType.Smooth);
    }

    toggleSmoothLocomotion(enabled: boolean) {
        if (this._smoothLocomotion) {
            this._smoothLocomotion.active = enabled;
        } else {
            console.warn(
                `locomotion-selector(${this.object.name}) doesn't smoothLocomotion set.`
            );
        }
    }

    toggleTeleport(enabled: boolean) {
        if (this._teleportLocomotion) {
            this._teleportLocomotion.active = enabled;
        } else {
            console.warn(
                `locomotion-selector(${this.object.name}) doesn't teleportLocomotion set.`
            );
        }
    }
}
