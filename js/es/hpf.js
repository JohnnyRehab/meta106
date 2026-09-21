// HPF panel, migrated to the final architecture: no Backbone view class,
// no separate .hbs template file, no jQuery. Renders directly into the
// container element (the same `.js-hpf-region` div the old Marionette
// region used to show into) and talks to the audio engine purely
// through `store` (see js/store.js).
//
// HPF's cutoff fader is a discrete 4-position control (not the usual
// continuous 0-1 range used elsewhere), so its drag math is kept local
// to this file rather than using js/es/fader.js's continuous-fader
// helper.

var POSITION_MAP = {
    0: '85%',
    1: '57%',
    2: '29%',
    3: '1%'
};

export function createHpfView(container, store) {
    container.classList.add('module', 'one', 'module--compact');
    container.innerHTML =
        '<div class="hpf control">' +
            '<div class="module__header--right-corner">' +
                '<h4>HPF</h4>' +
            '</div>' +
            '<div class="module__control-group">' +
                '<div class="label-container">' +
                    '<span class="label">FREQ</span>' +
                '</div>' +
                '<div class="fader-container">' +
                    '<div class="fader">' +
                        '<div class="fader__scale--hpf">' +
                            '<div class="fader__slot">' +
                                '<div class="fader__knob midi" data-param="hpf-cutoff" data-value="0" data-length="4">' +
                                    '<hr>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';

    var knob = container.querySelector('[data-param="hpf-cutoff"]');
    var currentSetting = null;
    var dragging = false;

    function applyPosition(value) {
        knob.style.top = POSITION_MAP[Math.floor(value)];
    }

    function calculateMovement(yPos) {
        var rect = knob.parentElement.getBoundingClientRect();
        var slotTop = rect.top + window.scrollY;
        var slotHeight = rect.height;
        var slotBottom = slotTop + slotHeight;
        var percentage = (yPos - slotTop) / slotHeight * 100;
        var value;

        if(yPos > slotBottom || percentage > 75) {
            value = 0;
        } else if(yPos < slotTop || percentage < 25) {
            value = 3;
        } else if(percentage >= 25 && percentage < 50) {
            value = 2;
        } else {
            value = 1;
        }

        if(currentSetting !== value) {
            store.set('hpf-cutoff', value);
            applyPosition(value);
            currentSetting = value;
        }
    }

    knob.addEventListener('mousedown', function(e) {
        dragging = true;
        e.preventDefault();
    });

    window.addEventListener('mousemove', function(e) {
        if(dragging) {
            calculateMovement(e.pageY);
        }
    });

    window.addEventListener('mouseup', function() {
        dragging = false;
    });

    // Initial position, and keep in sync with changes made elsewhere
    // (RESET, loading a shared patch, MIDI CC learn).
    currentSetting = Math.floor(store.get('hpf-cutoff'));
    applyPosition(currentSetting);
    store.on('change:hpf-cutoff', function(value) {
        currentSetting = Math.floor(value);
        applyPosition(value);
    });
}
