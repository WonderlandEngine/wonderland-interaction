import {Component, CollisionComponent, Emitter} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';

import {Interactor} from './interactor.js';

export class Interactable extends Component {
    static TypeName = 'interactable';

    /**
     * Properties.
     */

    @property.bool(true)
    public snap: boolean = true;

    /**
     * Private Attributes.
     */

    private _collision: CollisionComponent = null!;

    private readonly _onSelectStart: Emitter<[Interactor]> = new Emitter();
    private readonly _onSelectEnd: Emitter<[Interactor]> = new Emitter();

    public start(): void {
        this._collision = this.object.getComponent('collision', 0)!;
        if (!this._collision) {
            throw new Error(
                'Interactable.start(): No collision component found on the handle.'
            );
        }
    }

    public get onSelectStart(): Emitter<[Interactor]> {
        return this._onSelectStart;
    }

    public get onSelectEnd(): Emitter<[Interactor]> {
        return this._onSelectEnd;
    }
}
