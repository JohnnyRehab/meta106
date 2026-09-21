// LFO panel, migrated to the final architecture (see js/es/hpf.js for
// the rationale/pattern this follows).
import { setupFaderPosition, bindContinuousFader } from './fader.js';

export function createLfoView(container, store) {
    container.classList.add('module', 'two', 'module--compact');
    container.innerHTML =
        '<div class="lfo control">' +
            '<div class="module__header--left-corner">' +
                '<h4>LFO</h4>' +
            '</div>' +
            '<div class="module__control-group">' +
                '<div class="label-container">' +
                    '<span class="label">RATE</span>' +
                    '<span class="label">DELAY</span>' +
                '</div>' +
                '<div class="fader-container">' +
                    '<div class="fader">' +
                        '<div class="fader__scale--heavy"></div>' +
                        '<div class="fader__scale--light">' +
                            '<div class="fader__slot">' +
                                '<div class="fader__knob midi" data-param="lfo-rate" data-value="0">' +
                                    '<hr>' +
                                '</div>' +
                            '</div>' +
                            '<div class="fader__slot">' +
                                '<div class="fader__knob midi" data-param="lfo-delay" data-value="0">' +
                                    '<hr>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';

    var faders = [
        container.querySelector('[data-param="lfo-rate"]'),
        container.querySelector('[data-param="lfo-delay"]')
    ];

    faders.forEach(function(knob) {
        var param = knob.dataset.param;

        bindContinuousFader(knob, store);
        setupFaderPosition(knob, store.get(param));
        store.on('change:' + param, function(value) {
            setupFaderPosition(knob, value);
        });
    });
}
