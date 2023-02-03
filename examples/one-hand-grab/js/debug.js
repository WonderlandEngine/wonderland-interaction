import { Component, Type } from '@wonderlandengine/api';

export class DebugComponent extends Component {
    static TypeName = 'debug-component';

    static Properties = {
        target: { type: Type.Object }
    };

    start() {
        // @ts-ignore
        if (WL.xrSession) {
            // @ts-ignore
            this._setup(WL.xrSession);
        } else {
            // @ts-ignore
            WL.onXRSessionStart.push(this._setup.bind(this));
        }
        // Original transformation.
        this._transform = [ ...this.target.transformWorld ];
    }

    _setup(session) {
        session.addEventListener('squeezestart', (event) => {
            const physx = this.target.getComponent('physx');
            physx.active = false;
            this.target.transformWorld = this._transform;
            console.log('Squeeze starts.');
        });
    }
}
