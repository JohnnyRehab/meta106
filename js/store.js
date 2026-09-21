// Thin, dependency-free state accessor with the same get/set/on(change:x)
// shape as the Backbone model it wraps. For now it simply delegates to
// the existing Backbone `JunoModel` instance that drives the audio
// engine, patch sharing, MIDI learn, etc. — so migrating a panel's view
// to call store.get/set/on instead of the Backbone model directly
// requires no changes anywhere else in the app.
//
// Once every panel has been migrated off Backbone, only the inside of
// this function needs to change (to a plain object + listener map, no
// Backbone involved) to finish removing the dependency for real —
// nothing that already calls store.get/set/on will need to change again.
export function createStore(backboneModel) {
    return {
        get: function(key) {
            return backboneModel.get(key);
        },
        set: function(key, value) {
            backboneModel.set(key, value);
        },
        on: function(event, callback) {
            backboneModel.on(event, callback);
        }
    };
}
