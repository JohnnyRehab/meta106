// VCF panel, migrated to the final architecture (see js/es/hpf.js for
// the rationale/pattern this follows).
//
// The self-oscillation LED still listens on the same Backbone.Wreqr
// radio channel that js/synth/vcf.js (plain JS, no Backbone dependency
// itself) already publishes to. Backbone is still loaded globally for
// the not-yet-migrated panels, so this works without importing
// anything — it can be swapped for a plain window CustomEvent once
// Backbone is removed entirely.
import { bindAndSyncFader } from './fader.js';
import { bindAndSyncSwitch } from './switch.js';

export function createVcfView(container, store) {
    container.classList.add('module', 'five', 'module--compact');
    container.innerHTML =
        '<div class="vcf control">' +
            '<div class="module__header">' +
                '<h4>VCF</h4>' +
            '</div>' +
            '<div class="module__control-group">' +
                '<div class="label-container">' +
                    '<span class="label--wide">FREQ</span>' +
                    '<span class="label--wide">RES</span>' +
                '</div>' +
                '<div class="fader-container">' +
                    '<div class="fader">' +
                        '<div class="fader__scale--heavy"></div>' +
                        '<div class="fader__scale--light">' +
                            '<div class="fader__slot">' +
                                '<div class="fader__knob midi" data-param="vcf-cutoff" data-value="1"><hr></div>' +
                            '</div>' +
                            '<div class="fader__slot">' +
                                '<div class="fader__knob midi" data-param="vcf-res" data-value="0"><hr></div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="module__switch-control-group">' +
                '<div class="knob-container--vcf">' +
                    '<p class="label">^</p>' +
                    '<div class="switch">' +
                        '<div class="switch__knob midi" data-param="vcf-invert" data-value="1" data-length="2"></div>' +
                    '</div>' +
                    '<p class="label">v</p>' +
                '</div>' +
            '</div>' +
            '<div class="module__control-group">' +
                '<div class="label-container">' +
                    '<span class="label">ENV</span>' +
                    '<span class="label">LFO</span>' +
                    '<span class="label">KBD</span>' +
                '</div>' +
                '<div class="fader-container">' +
                    '<div class="fader">' +
                        '<div class="fader__scale--heavy"></div>' +
                        '<div class="fader__scale--light">' +
                            '<div class="fader__slot">' +
                                '<div class="fader__knob midi" data-param="vcf-envMod"><hr></div>' +
                            '</div>' +
                            '<div class="fader__slot">' +
                                '<div class="fader__knob midi" data-param="lfo-freqMod"><hr></div>' +
                            '</div>' +
                            '<div class="fader__slot">' +
                                '<div class="fader__knob midi" data-param="vcf-keyFollow"><hr></div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';

    ['vcf-cutoff', 'vcf-res', 'vcf-envMod', 'lfo-freqMod', 'vcf-keyFollow'].forEach(function(param) {
        bindAndSyncFader(container, param, store);
    });

    bindAndSyncSwitch(container, 'vcf-invert', store);

    var resKnob = container.querySelector('[data-param="vcf-res"]');
    window.Backbone.Wreqr.radio.channel('synth').vent.on('vcf:selfOscillate', function(isSelfOscillating) {
        resKnob.classList.toggle('fader__knob--self-oscillating', isSelfOscillating);
    });
}
