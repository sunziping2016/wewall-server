const uuid = require('uuid/v4');

module.exports = class {
    constructor(app) {
        this.app = app;
        this.current = null;
        this.index = {};
    }
    stack() {
        return this.app.stack || (this.app._router? this.app._router.stack : null);
    }
    use(route, fn) {
        if ('string' != typeof route)
            fn = route;

        this.current = fn;

        // forward call to app.use
        if (this.app._use)
            this.app._use.apply(this.app, arguments);
        else
            this.app.use.apply(this.app, arguments);

        return this;
    };
    as(label) {
        this.current.label = label;
    }
    get_order() {
        return this.stack().map(layer => layer.handle.label || (layer.handle.label = uuid()));
    }
    get_available() {
        this.stack().forEach(layer => this.index[layer.handle.label || (layer.handle.label = uuid())] = layer);
        return Object.keys(this.index);
    }
    set_order(order) {
        let stack = this.stack();
        stack.forEach(layer => this.index[layer.handle.label || (layer.handle.label = uuid())] = layer);
        stack.splice(0, stack.length, ...order.map(label => this.index[label]));
    }
};
