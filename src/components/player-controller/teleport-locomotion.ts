import {Component} from '@wonderlandengine/api';
import {typename} from '../../constants.js';
import {PlayerController} from './player-controller.js';

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
