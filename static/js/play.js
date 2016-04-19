
var websocket = null;
var connected = false;
var everconnected = false;

/* When there are more than 200 lines in the event pane, chop it down to
   the last 160. */
var EVENT_TRIM_LIMIT = 200;
var EVENT_TRIM_KEEP = 160;

var KEY_RETURN = 13;
var KEY_ESC = 27;
var KEY_UP = 38;
var KEY_DOWN = 40;

var NBSP = '\u00A0';

/* Construct the DOM for the page.
*/
function build_page_structure() {
    /* Clear out the body from the play.html template. */
    $('#submain').empty();

    var topcol = $('<div>', { id: 'topcol' });
    var leftcol = $('<div>', { id: 'leftcol' });
    var localepane = $('<div>', { id: 'localepane' });
    var bottomcol = $('<div>', { id: 'bottomcol' });
    var eventpane = $('<div>', { id: 'eventpane' });
    var eventboxpane = $('<div>', { id: 'eventboxpane' });

    localepane.append($('<div>', { id: 'localepane_locale' }));
    localepane.append($('<div>', { id: 'localepane_populace' }));

    var inputline = $('<div>', { 'class': 'Input' });
    var inputprompt = $('<div>', { 'class': 'InputPrompt' });
    var inputframe = $('<div>', { 'class': 'InputFrame' });

    inputprompt.text('>');
    inputframe.append($('<input>', { id: 'eventinput', type: 'text', maxlength: '256' } ));
    inputline.append(inputprompt);
    inputline.append(inputframe);

    topcol.append(leftcol);
    leftcol.append(localepane);
    bottomcol.append($('<div>', { id: 'bottomcol_topedge' }));
    bottomcol.append(eventboxpane);
    eventboxpane.append(eventpane);
    eventpane.append(inputline);

    /* Add the top-level, fully-constructed structures to the DOM last. More
       efficient this way. */
    $('#submain').append(topcol);
    $('#submain').append(bottomcol);
}

function build_focuspane(contentls)
{
    var focuspane = $('<div>', { class: 'FocusPane FocusPaneAnimating',
                                 style: 'display:none;' });

    var focusoutline = $('<div>', { 'class': 'FocusOutline' });
    var focuscornercontrol = $('<div class="FocusCornerControl"><a href="#">Close</a></div>');
    focusoutline.append(focuscornercontrol);
    focusoutline.append($('<div>', { 'class': 'InvisibleAbovePara' }));
    for (var ix=0; ix<contentls.length; ix++) {
        focusoutline.append(contentls[ix]);
    }
    focusoutline.append($('<div>', { 'class': 'InvisibleBelowPara' }));
    focuspane.append(focusoutline);

    /* ### make this close control look and act nicer. */
    focuscornercontrol.on('click', evhan_click_dropfocus);

    return focuspane;
}

function setup_event_handlers() {
    $(document).on('keypress', evhan_doc_keypress);
    $(document).on('keydown', evhan_doc_keydown);

    var inputel = $('#eventinput');
    inputel.on('keypress', evhan_input_keypress);
    inputel.on('keydown', evhan_input_keydown);
    
    $('#topcol').resizable( { handles:'s', containment:'parent',
          distance: 4,
          resize:handle_updown_resize, stop:handle_updown_doneresize } );
    
    $('div.ui-resizable-handle').append('<div class="ResizingThumb">');
}

function open_websocket() {
    try {
        var url = (use_ssl ? 'wss://' : 'ws://') + window.location.host + '/websocket';
        console.log('Creating websocket: ' + url);
        websocket = new WebSocket(url);
    }
    catch (ex) {
        eventpane_add('Unable to open websocket: ' + ex, 'EventError');
        display_error('The connection to the server could not be created. Possibly your browser does not support websockets.');
        return;
    }

    websocket.onopen = evhan_websocket_open;
    websocket.onclose = evhan_websocket_close;
    websocket.onmessage = evhan_websocket_message;
}

function display_error(msg) {
    var el = $('<div>', { 'class':'BlockError'} );
    el.text(msg);

    var localeel = $('#localepane_locale');
    localeel.empty();
    localeel.append(el);

    $('#localepane_populace').empty();
    focuspane_clear();
}

/* Contains a map of all segments currently in the tool column.
   (Minimized ones count. The header bar doesn't count.)
*/
var toolsegments = {};

function localepane_set_locale(desc, title) {
    var localeel = $('#localepane_locale');
    localeel.empty();

    if (title) {
        var titleel = $('<h2>');
        titleel.text(title);
        localeel.append(titleel);
    }

    var contentls;
    try {
        contentls = parse_description(desc);
    }
    catch (ex) {
        var el = $('<p>');
        el.text('[Error rendering description: ' + ex + ']');
        contentls = [ el ];
    }
    for (var ix=0; ix<contentls.length; ix++) {
        localeel.append(contentls[ix]);
    }
}

function localepane_set_populace(desc) {
    var localeel = $('#localepane_populace');
    localeel.empty();

    if (!desc)
        return;

    var contentls;
    try {
        contentls = parse_description(desc);
    }
    catch (ex) {
        var el = $('<p>');
        el.text('[Error rendering description: ' + ex + ']');
        contentls = [ el ];
    }
    for (var ix=0; ix<contentls.length; ix++) {
        localeel.append(contentls[ix]);
    }
}

function eventpane_add(msg, extraclass) {
    var frameel = $('#eventpane');

    /* Determine whether the event pane is currently scrolled to the bottom
       (give or take a margin of error). Note that scrollHeight is not a jQuery
       property; we have to go to the raw DOM to get it. */
    var atbottom = (frameel.get(0).scrollHeight - (frameel.scrollTop() + frameel.outerHeight()) < 40);

    var cls = 'Event';
    if (extraclass)
        cls = cls + ' ' + extraclass;
    var el = $('<div>', { 'class':cls} );
    el.text(msg);
    var dateel = $('<div>', { 'class':'TimeStamp'} );
    dateel.text('\u00A0\u25C7');
    var subel = $('<div>', { 'class':'TimeLabel'} );
    subel.append($('<span>').text(NBSP+current_time_string()));
    dateel.prepend(subel);
    el.prepend(dateel);
    $('.Input').before(el);

    /* If there are too many lines in the event pane, chop out the early
       ones. That's easy. Keeping the apparent scroll position the same --
       that's harder. */
    var eventls = $('#eventpane .Event');
    var curcount = eventls.size();
    if (curcount > EVENT_TRIM_LIMIT) {
        var firstkeep = curcount - EVENT_TRIM_KEEP;
        var remls = eventls.slice(0, firstkeep);
        /* Calculate the vertical extent of the entries to remove, *not
           counting the top margin*. (We have a :first-child top margin
           to give the top edge of the pane some breathing room.) This
           margin calculation uses a possibly undocumented feature of
           query -- $.css(e, p, true) returns a number instead of a "16px"
           string. Hope this doesn't bite me on the toe someday.
        */
        var remheight = $(eventls[firstkeep]).position().top - $(eventls[0]).position().top - $.css(eventls[0], 'marginTop', true);
        frameel.scrollTop(frameel.scrollTop() - remheight);
        remls.remove();
    }

    /* If we were previously scrolled to the bottom, scroll to the new 
       bottom. */
    if (atbottom) {
        var newscrolltop = frameel.get(0).scrollHeight - frameel.outerHeight() + 2;
        frameel.stop().animate({ 'scrollTop': newscrolltop }, 200);
    }
}

function focuspane_clear()
{
    /* If any old panes are in the process of sliding up or down, we
       kill them unceremoniously. */
    var oldel = $('.FocusPaneAnimating');
    if (oldel.length) {
        oldel.remove();
    }

    /* If an old pane exists, slide it out. (The call is "slideUp", even
       though the motion will be downwards. jQuery assumes everything is
       anchored at the top, but we are anchored at the bottom.) */
    var el = $('.FocusPane');
    if (el.length) {
        el.addClass('FocusPaneAnimating');
        el.slideUp(200, function() { el.remove(); });
    }
}

function focuspane_set(desc, extrals)
{
    var contentls;
    try {
        contentls = parse_description(desc);
    }
    catch (ex) {
        var el = $('<p>');
        el.text('[Error rendering description: ' + ex + ']');
        contentls = [ el ];
    }

    if (extrals) {
        /* Append to end of contentls. */
        for (var ix=0; ix<extrals.length; ix++)
            contentls.push(extrals[ix]);
    }

    /* Clear out old panes and slide in the new one. (It will have the
       'FocusPaneAnimating' class until it finishes sliding.) */

    focuspane_clear();

    var newpane = build_focuspane(contentls);
    $('#leftcol').append(newpane);
    newpane.slideDown(200, function() { newpane.removeClass('FocusPaneAnimating'); } );
}

var focuspane_special_val = [];
var focuspane_special_editplist = null;

function focuspane_set_special(ls) {
    /* ### This seriously neglects dependencies. */

    var type = '???';
    try {
        type = ls[0];
        focuspane_special_val = ls;
        focuspane_special_editplist = null;
        if (type == 'selfdesc') {
            /* ['selfdesc', name, pronoun, desc, extratext] */
            var extrals = selfdesc_build_controls();
            focuspane_set(ls[4], extrals);
            $('.FormSelfDescPronoun').prop('value', ls[2]);
            selfdesc_update_labels();
            $('.FormSelfDescPronoun').on('change', selfdesc_pronoun_changed);
            /* Accept edits on enter, or if the focus leaves the textarea. */
            $('.FormSelfDescDesc').on('blur', selfdesc_desc_blur);
            $('.FormSelfDescDesc').on('keypress', function(ev) {
                    if (ev.which == KEY_RETURN) {
                        ev.preventDefault();
                        selfdesc_desc_blur();
                    }
                });
            return;
        }
        if (type == 'editstr') {
            /* ['editstr', key, value, extratext] */
            var extrals = editstr_build_controls();
            focuspane_set(ls[3], extrals);
            $('.FormEditStrValue').on('blur', editstr_value_blur);
            $('.FormEditStrValue').on('keypress', function(ev) {
                    if (ev.which == KEY_RETURN) {
                        ev.preventDefault();
                        editstr_value_blur();
                    }
                });
            return;
        }
        if (type == 'portal') {
            var target = ls[1];
            var portalobj = ls[2];
            var backtarget = ls[3];
            var extratext = ls[4];
            /* Note that extratext, if present, may be a full-fledged
               description. */
            var extrals = [];
            if (backtarget) {
                var ael = $('<a>', {href:'#'+backtarget});
                ael.text(localize('client.label.back_to_plist'));
                ael.on('click', {target:backtarget}, evhan_click_action);
                var el = $('<p>');
                el.append(ael);
                extrals.push(el);
            }
            var el = $('<p>');
            el.text(portalobj.view);
            extrals.push(el);
            var ael = $('<a>', {href:'#'+target});
            ael.text(localize('client.label.enter_portal'));
            ael.on('click', {target:target, portal:portalobj}, function(ev) {
                    ev.preventDefault();
                    var portal = ev.data.portal;
                    var scid = portal.scid;
                    var msg = { cmd:'action', action:ev.data.target };
                    if (portal.instancing == 'standard' && toolsegments['portal']) {
                        var scid = toolsegments['portal'].flexselectel.prop('value');
                        if (scid && scid != portal.scid) 
                            msg.scid = scid;
                    }
                    websocket_send_json(msg);
                });
            el = $('<p>');
            el.append(ael);
            extrals.push(el);
            focuspane_set(extratext, extrals);
            return;
        }
        if (type == 'portlist') {
            var portlist = ls[1];
            var extratext = ls[2];
            var editable = ls[3];
            /* Note that extratext, if present, may be a full-fledged
               description. */
            var extrals = [];
            if (editable) {
                focuspane_special_editplist = $('<div>');
                extrals.push(focuspane_special_editplist);

                var buttonel = $('<input>', { 'class':'FocusButtonLarge FocusPlistEditButton', type:'submit', value:localize('client.button.edit_collection') });
                buttonel.on('click', function(ev) { ev.preventDefault(); plistedit_toggle_edit(); })
                var barel = $('<div>', {'class':'FocusButtonBar'});
                barel.append(buttonel);
                focuspane_special_editplist.append(barel);
                var el = $('<div>', {'class':'FocusPlistEdit', 'style':'display:none;'});
                var labelel = $('<div>', {'class':'FocusPlistPortal'}).text('--');
                el.append(labelel);
                var buttonel = $('<input>', { 'class':'FocusPlistAddButton', type:'submit', value:localize('client.button.add_portal') });
                buttonel.on('click', function(ev) { ev.preventDefault(); plistedit_add_portal(); })
                var barel = $('<div>', {'class':'FocusButtonBar'});
                barel.append(buttonel);
                el.append(barel);
                focuspane_special_editplist.append(el);
                plistedit_update_portal_selection();
            }
            if (!portlist.length) {
                var el = $('<p>').text(localize('client.label.plist_is_empty'));
                extrals.push(el);
            }
            else {
                var el = $('<ul>', {'class':'FocusPlistList'});
                extrals.push(el);
                for (var ix=0; ix<portlist.length; ix++) {
                    var portal = portlist[ix];
                    var lel = $('<li>');
                    if (editable) {
                        var delbutton = $('<div>', {'class':'FocusListDelButton ToolControl', style:'display:none;'}).text('\u00D7');
                        delbutton.on('click', {portal:portal, listel:lel}, function(ev) {
                                ev.preventDefault(); 
                                plistedit_toggle_delete(ev.data.portal, ev.data.listel);
                            } );
                        lel.append(delbutton);
                        lel.append(' ');
                    }
                    var ael = $('<a>', {href:'#'+portal.target});
                    ael.text(portal.world);
                    ael.on('click', {target:portal.target}, evhan_click_action);
                    lel.append(ael);

                    lel.append(' ' + NBSP + ' ');
                    var spel = $('<span>', {'class':'FocusPlistGloss'});
                    spel.append('(' + portal.scope + ')');
                    lel.append(spel);

                    lel.append(' ' + NBSP + '\u2013 ');
                    var spel = $('<span>', {'class':'StyleEmph'});
                    spel.text(localize('client.label.created_by').replace('%s', portal.creator));
                    lel.append(spel);

                    el.append(lel);
                }
            }
            focuspane_set(extratext, extrals);
            return;
        }
        focuspane_set('### ' + type + ': ' + ls);
    }
    catch (ex) {
        focuspane_special_val = [];
        focuspane_special_editplist = null;
        focuspane_set('[Error creating special focus ' + type + ': ' + ex + ']');
    }
}

/* Returns the portal object that focus is set to, if any; otherwise null.
 */
function focuspane_current_special_portal() {
    var portal = null;
    if (focuspane_special_val && focuspane_special_val[0] == 'portal') {
        portal = focuspane_special_val[2];
    }
    return portal;
}

/* Returns the edit action key, if the focus is set to an editable portlist.
   Otherwise returns null.
 */
function focuspane_current_special_plist_editable() {
    if (focuspane_special_val && focuspane_special_val[0] == 'portlist') {
        if (focuspane_special_val[3])
            return focuspane_special_val[3];
    }
    return false;
}

function plistedit_toggle_edit() {
    var editkey = focuspane_current_special_plist_editable();
    if (!editkey)
        return;
    var editel = $('.FocusPane .FocusPlistEdit');
    if (!editel.length)
        return;

    if (!editel.data('visible')) {
        $('.FocusPlistEditButton').prop('value', localize('client.button.done_editing'));
        editel.data('visible', true);
        editel.slideDown(200);
        $('.FocusListDelButton').show(200);
        plistedit_update_portal_selection();
    }
    else {
        $('.FocusPlistEditButton').prop('value', localize('client.button.edit_collection'));
        editel.data('visible', false);
        editel.slideUp(200);
        $('.FocusListDelButton').hide(200);
        $('.FocusPlistList .FocusButtonBar').remove();
    }
}

function plistedit_add_portal() {
    var editkey = focuspane_current_special_plist_editable();
    if (!editkey)
        return;
    var editel = $('.FocusPane .FocusPlistEdit');
    if (!editel.length)
        return;

    if (!editel.data('visible')) 
        return;

    var seg = toolsegments['plist'];
    var portal = seg.map[seg.selection];
    if (!portal) 
        return;
    
    websocket_send_json({
        cmd:'action', action:editkey,
        edit:'add', portid:portal.portid});
}

function plistedit_update_portal_selection() {
    var editkey = focuspane_current_special_plist_editable();
    if (!editkey)
        return;
    var editel = $('.FocusPane .FocusPlistEdit');
    if (!editel.length)
        return;

    var el = editel.find('.FocusPlistPortal');
    if (!el)
        return;
    
    var seg = toolsegments['plist'];
    var portal = seg.map[seg.selection];
    if (!portal) {
        el.text(localize('client.label.select_portal_to_add'));
        $('.FocusPlistAddButton').prop('disabled', true);
    }
    else {
        el.text(portal.world + ' \u2013 ' + portal.location + ' (' + portal.scope + ')' + ' \u2013 ' + portal.creator);
        $('.FocusPlistAddButton').prop('disabled', false);
    }

}

function plistedit_toggle_delete(portal, listel) {
    var editkey = focuspane_current_special_plist_editable();
    if (!editkey)
        return;
    var editel = $('.FocusPane .FocusPlistEdit');
    if (!editel.length)
        return;

    if (!editel.data('visible')) 
        return;

    var barel = listel.find('.FocusButtonBar');
    if (barel.length) {
        barel.slideUp(200, function() { barel.remove(); });
        return;
    }

    barel = $('<div>', {'class':'FocusButtonBar', style:'display:none;'});
    var buttonel = $('<input>', { type:'submit', value:localize('client.button.cancel') });
    barel.append(buttonel);
    buttonel.on('click', {portal:portal, listel:listel}, function(ev) {
            /* Cancel button calls back to this function, to toggle
               the buttons away. */
            ev.preventDefault(); 
            plistedit_toggle_delete(ev.data.portal, ev.data.listel);
        } );

    var buttonel = $('<input>', { type:'submit', value:localize('client.button.delete') });
    barel.append(buttonel);
    buttonel.on('click', {portal:portal, listel:listel}, function(ev) {
            ev.preventDefault(); 
            websocket_send_json({
                cmd:'action', action:editkey,
                edit:'delete', portid:ev.data.portal.portid});
        });

    listel.append(barel);
    barel.slideDown(200);
}

function selfdesc_build_controls() {
    /* ['selfdesc', name, pronoun, desc, extratext] */
    var extrals = [];
    var el, divel, optel;

    divel = $('<div>', { 'class':'FocusSection' });
    extrals.push(divel);
    el = $('<span>').text('You see...');
    divel.append(el);
    el = $('<br>');
    divel.append(el);
    el = $('<textarea>', { 'class':'FormSelfDescDesc FocusInput', rows:2,
                           autocapitalize:'off', autofocus:'autofocus',
                           name:'desc' });
    el.text(focuspane_special_val[3]);
    divel.append(el);

    divel = $('<div>', { 'class':'FocusSection' });
    extrals.push(divel);
    el = $('<span>').text('Your pronouns: ');
    divel.append(el);
    el = $('<select>', { 'class':'FormSelfDescPronoun FocusSelect', name:'select' });
    divel.append(el);
    optel = $('<option>', { value:'he' }).text('He, his');
    el.append(optel);
    optel = $('<option>', { value:'she' }).text('She, her');
    el.append(optel);
    optel = $('<option>', { value:'it' }).text('It, its');
    el.append(optel);
    optel = $('<option>', { value:'they' }).text('They, their');
    el.append(optel);
    optel = $('<option>', { value:'name' }).text(focuspane_special_val[1] + ', ' + focuspane_special_val[1] + "'s");
    el.append(optel);

    el = $('<div>', { 'class':'FocusDivider' });
    extrals.push(el);

    el = $('<p>', { 'class':'FormSelfDescLabel1 StyleEmph' });
    el.text('is...');
    extrals.push(el);

    el = $('<p>', { 'class':'FormSelfDescLabel2 StyleEmph' });
    el.text('pronoun...');
    extrals.push(el);

    return extrals;
}

function selfdesc_pronoun_changed() {
    var val = $('.FormSelfDescPronoun').prop('value');
    if (val == focuspane_special_val[2])
        return;

    focuspane_special_val[2] = val;
    selfdesc_update_labels();

    websocket_send_json({ cmd:'selfdesc', pronoun:val });
}

function selfdesc_desc_blur() {
    var val = $('.FormSelfDescDesc').prop('value');
    val = val.replace(new RegExp('\\s+', 'g'), ' ');
    val = jQuery.trim(val);
    if (!val)
        val = 'an ordinary explorer.';
    $('.FormSelfDescDesc').prop('value', val);

    if (val == focuspane_special_val[3])
        return;

    focuspane_special_val[3] = val;
    selfdesc_update_labels();

    websocket_send_json({ cmd:'selfdesc', desc:val });
}

function selfdesc_update_labels() {
    var val = focuspane_special_val[1] + ' is ' + focuspane_special_val[3];
    $('.FormSelfDescLabel1').text(val);

    switch (focuspane_special_val[2]) {
    case 'he':
        val = 'He is considering his appearance.';
        break;
    case 'she':
        val = 'She is considering her appearance.';
        break;
    case 'they':
        val = 'They are considering their appearance.';
        break;
    case 'name':
        val = focuspane_special_val[1] + ' is considering ' + focuspane_special_val[1] + '\'s appearance.';
        break;
    case 'it':
    default:
        val = 'It is considering its appearance.';
        break;
    }
    $('.FormSelfDescLabel2').text(val);
}

function editstr_build_controls() {
    /* ['editstr', key, value, extratext] */
    var extrals = [];
    var el, divel, optel;

    divel = $('<div>', { 'class':'FocusSection' });
    extrals.push(divel);
    el = $('<textarea>', { 'class':'FormEditStrValue FocusInput', rows:2,
                           autocapitalize:'on', autofocus:'autofocus',
                           name:'desc' });
    el.text(focuspane_special_val[2]);
    divel.append(el);

    return extrals;
}

function editstr_value_blur() {
    var val = $('.FormEditStrValue').prop('value');
    val = val.replace(new RegExp('\\s+', 'g'), ' ');
    val = jQuery.trim(val);
    $('.FormEditStrValue').prop('value', val);

    if (val == focuspane_special_val[2])
        return;

    focuspane_special_val[2] = val;
    websocket_send_json({ cmd:'action', action:focuspane_special_val[1], val:val });
}

/* All the commands that can be received from the server. */

function cmd_event(obj) {
    eventpane_add(obj.text);
    notify('event', obj.text);
}

function cmd_update(obj) {
    if (true) {
        /* Debug log message: what's in the update? */
        var upsum = '';
        jQuery.each(obj, function(key, val) {
                if (key == 'cmd')
                    return;
                val = JSON.stringify(val);
                if (val.length > 32)
                    val = val.slice(0,32) + '...';
                upsum = upsum + ' ' + key + ':' + val + ',';
            }
            );
        console.log('### update summary:' + upsum);
    }

    if (obj.locale !== undefined) {
        localepane_set_locale(obj.locale.desc, obj.locale.name);
    }
    if (obj.populace !== undefined) {
        localepane_set_populace(obj.populace);
    }
    if (obj.focus !== undefined) {
        focuspane_special_val = [];
        focuspane_special_editplist = null;
        if (!obj.focus)
            focuspane_clear();
        else if (obj.focusspecial)
            focuspane_set_special(obj.focus);
        else
            focuspane_set(obj.focus);
    }

    /* Could call notify here, but I think event-pane messages are sufficient. */
}

var availscopemap = {};
var availscopelist = [];

function cmd_updatescopes(obj) {
    if (obj.clear) {
        availscopemap = {};
    }

    if (obj.map) {
        jQuery.each(obj.map, function(scid, scope) {
                if (scope === false) {
                    delete availscopemap[scid];
                }
                else {
                    availscopemap[scid] = scope;
                    /* Add a hacky sorting key */
                    if (scope.type == 'glob')
                        scope.sortkey = '0_';
                    else if (scope.type == 'pers' && scope.you)
                        scope.sortkey = '1_';
                    else if (scope.type == 'pers')
                        scope.sortkey = '2_' + scope.id;
                    else
                        scope.sortkey = '3_' + scope.id;
                }
            });
    }

    /* Rebuild the list, regardless. */
    availscopelist.length = 0;
    jQuery.each(availscopemap, function(scid, scope) {
            availscopelist.push(scope);
        });

    availscopelist.sort(function(p1, p2) {
            if (p1.sortkey < p2.sortkey)
                return -1;
            if (p1.sortkey > p2.sortkey)
                return 1;
            return 0;
        });
}

function cmd_clearfocus(obj) {
    /* Same as update { focus:false }, really */
    focuspane_special_val = [];
    focuspane_special_editplist = null;
    focuspane_clear();
}

function cmd_message(obj) {
    eventpane_add(obj.text, 'EventMessage');
    notify('message', obj.text);
}

function cmd_error(obj) {
    eventpane_add('Error: ' + obj.text, 'EventError');
}

function cmd_extendcookie(obj) {
    /* Extend an existing cookie to a new date. */
    var key = obj.key;
    var date = obj.date;
    var re = new RegExp(key+'=([^;]*)');
    var match = re.exec(document.cookie);
    if (match) {
        var val = match[1];
        var newval = key+'='+val+';expires='+date;
        document.cookie = newval;
    }
}

var command_table = {
    event: cmd_event,
    update: cmd_update,
    updatescopes: cmd_updatescopes,
    clearfocus: cmd_clearfocus,
    message: cmd_message,
    error: cmd_error,
    extendcookie: cmd_extendcookie
};

/* Transform a description array (a JSONable array of strings and array tags)
   into a list of DOM elements. You can also pass in a raw string, which
   will be treated as a single unstyled paragraph.

   The description array is roughly parallel to HTML markup, with beginning
   and end tags for styles, and paragraph tags between (not around) paragraphs.
   We don't rely on jQuery's HTML-to-DOM features, though. We're going to
   build it ourselves, with verbose error reporting. (Authors will build
   this stuff interactively, and they deserve explicit bad-format warnings!)
*/
function parse_description(desc) {
    if (desc === null || desc === undefined)
        return [];

    if (!jQuery.isArray(desc))
        desc = [ desc ];

    var parals = [];
    var objstack = [];
    var elstack = [];

    /* It's easier if we keep a "current paragraph" around at all times.
       But we'll need to keep track of whether it's empty, because empty
       paragraphs shouldn't appear in the output. */
    var curpara = $('<p>');
    var curparasize = 0;
    var curinlink = false;
    parals.push(curpara);

    for (var ix=0; ix<desc.length; ix++) {
        var obj = desc[ix];
        var el = null;
        var parent;

        /* If we are going to add a new node, it will go on the most deeply-
           nested style, *or* the top-level paragraph (if there are no nested
           styles). Work this out now. */
        if (elstack.length == 0)
            parent = curpara;
        else
            parent = elstack[elstack.length-1];

        if (jQuery.isArray(obj)) {
            var objtag = obj[0];

            if (objtag == 'para') {
                if (objstack.length > 0) {
                    el = create_text_node('[Unclosed tags at end of paragraph]');
                    parent.append(el);
                    curparasize++;
                    objstack.length = 0;
                    elstack.length = 0;
                }

                if (curparasize == 0) {
                    /* We're already at the start of a fresh paragraph.
                       Just keep using it. */
                    continue;
                }

                curpara = $('<p>');
                curparasize = 0;
                curinlink = false;
                parals.push(curpara);
                continue;
            }

            if (objtag[0] == '/') {
                /* End an outstanding span. */
                if (objstack.length == 0) {
                    el = create_text_node('[End tag with no start tag]');
                    parent.append(el);
                    curparasize++;
                    continue;
                }

                var startobj = objstack[objstack.length-1];
                if (objtag == '/link') {
                    if (startobj[0] != 'link')
                        el = create_text_node('[Mismatched end of link]');
                    curinlink = false;
                }
                else if (objtag == '/exlink') {
                    if (startobj[0] != 'exlink')
                        el = create_text_node('[Mismatched end of external link]');
                    curinlink = false;
                }
                else if (objtag == '/style') {
                    if (startobj[0] != 'style')
                        el = create_text_node('[Mismatched end of style]');
                }
                else {
                    el = create_text_node('[Unrecognized end tag '+objtag+']');
                }

                if (el !== null) {
                    /* Paste on the error message. */
                    parent.append(el);
                    curparasize++;
                }

                objstack.length = objstack.length-1;
                elstack.length = elstack.length-1;
                continue;
            }
            else {
                /* Start a new span. */
                if (objtag == 'style') {
                    el = $('<span>');
                    var styleclass = description_style_classes[obj[1]];
                    if (!styleclass)
                        el.append(create_text_node('[Unrecognized style name]'));
                    else
                        el.addClass(styleclass);
                    objstack.push(obj);
                    elstack.push(el);
                }
                else if (objtag == 'link') {
                    if (curinlink)
                        parent.append(create_text_node('[Nested links]'));
                    var target = obj[1];
                    el = $('<a>', {href:'#'+target});
                    el.on('click', {target:target}, evhan_click_action);
                    objstack.push(obj);
                    elstack.push(el);
                    curinlink = true;
                }
                else if (objtag == 'exlink') {
                    /* External link -- distinct class, and opens in a new
                       window. */
                    if (curinlink)
                        parent.append(create_text_node('[Nested links]'));
                    el = $('<a>', { 'class': 'ExternalLink', 'target': '_blank', href:obj[1] });
                    objstack.push(obj);
                    elstack.push(el);
                    curinlink = true;
                }
                else {
                    el = create_text_node('[Unrecognized tag '+objtag+']');
                }

                parent.append(el);
                curparasize++;
            }
        }        
        else {
            /* String. */
            if (obj.length) {
                el = create_text_node(obj);
                parent.append(el);
                curparasize++;
            }
        }
    }

    if (objstack.length > 0) {
        var el = create_text_node('[Unclosed tags at end of text]');
        curpara.append(el);
        curparasize++;
    }

    if (curparasize == 0 && parals.length > 0) {
        /* The last paragraph never got any content. Remove it from
           the list. */
        parals.length = parals.length - 1;
    }

    return parals;
}

/* Create an HTML DOM node.
 * The original tworld won't let you have any HTML in your texts.*/
function create_text_node(val)
{
    var htmlNode = document.createElement('span');
    htmlNode.innerHTML = val;
    return htmlNode;
}

/* Run a function (no arguments) in timeout seconds. Returns a value that
   can be passed to cancel_delayed_func(). */
function delay_func(timeout, func)
{
    return window.setTimeout(func, timeout*1000);
}

/* Cancel a delayed function. */
function cancel_delayed_func(val)
{
    window.clearTimeout(val);
}

/* Run a function (no arguments) "soon". */
function defer_func(func)
{
    return window.setTimeout(func, 0.01*1000);
}

function submit_line_input(val) {
    val = jQuery.trim(val);

    var historylast = null;
    if (eventhistory.length)
        historylast = eventhistory[eventhistory.length-1];
    
    /* Store this input in the command history for this window, unless
       the input is blank or a duplicate. */
    if (val && val != historylast) {
        eventhistory.push(val);
        if (eventhistory.length > 30) {
            /* Don't keep more than thirty entries. */
            eventhistory.shift();
        }
    }
    if (val) {
        eventhistorypos = eventhistory.length;
    }
    
    var inputel = $('#eventinput');
    inputel.val('');

    if (val) {
        var start = val.charAt(0);
        if (start == ':') {
            websocket_send_json({ cmd:'pose', text:jQuery.trim(val.slice(1)) });
        }
        else if (start == '/') {
            /* Echo slash commands, because that's less confusing. */
            /* ### Should use a separate span for the >, so the style matches. */
            eventpane_add('> ' + val, 'EventEchoInput');
            websocket_send_json({ cmd:'meta', text:jQuery.trim(val.slice(1)) });
        }
        else {
            websocket_send_json({ cmd:'say', text:val });
        }
    }
}

/* Code to deal with notifications. */

var last_activity = new Date();
var notify_title_bar_marked = false;
var notify_orig_title = document.title;
var notify_current_notif = null;

/* Display a notification if appropriate.
*/
function notify(typ, text) {
    var donote = false;

    /* Mark event if we've been idle for 30 seconds. */
    donote = (new Date() - last_activity > 30000);

    if (donote) {
        var opt = { tag:'tag' };
        if (text)
            opt.body = text;
        notify_current_notif = new window.Notification('Seltani activity', opt);
    }
}

/* Clear the notification marker (if there is one). We check both of
   the possible markers, just in case.
*/
function notify_clear() {
    if (notify_title_bar_marked) {
        document.title = notify_orig_title;
        notify_title_bar_marked = false;
    }

    if (notify_current_notif !== null) {
        notify_current_notif.close();
        notify_current_notif = null;
    }
}

/* Event handler: keydown events on the top-level document.

   On Escape, close the focus window (if open).
*/
function evhan_doc_keydown(ev) {
    var keycode = 0;
    if (ev) keycode = ev.which;

    if (keycode == KEY_ESC) {
        ev.preventDefault();
        var el = $('.FocusPane');
        if (el.length) {
            websocket_send_json({ cmd:'dropfocus' });
        }
        return;
    }
}

/* Event handler: keypress events on the top-level document.

   Move the input focus to the event pane's input line.
*/
function evhan_doc_keypress(ev) {
    var keycode = 0;
    if (ev) keycode = ev.which;

    /* If we're not scrolled to the bottom, scroll to the bottom. Yes,
       we're going to check this on every single document keystroke.
       It doesn't seem to be necessary in Safari, but it does in Firefox. */
    var frameel = $('#eventpane');
    var bottomdiff = (frameel.get(0).scrollHeight - (frameel.scrollTop() + frameel.outerHeight()));
    if (bottomdiff > 0) {
        var newscrolltop = frameel.get(0).scrollHeight - frameel.outerHeight() + 2;
        frameel.stop().animate({ 'scrollTop': newscrolltop }, 200);
    }
    
    var tagname = ev.target.tagName.toUpperCase();   
    if (tagname == 'INPUT' || tagname == 'TEXTAREA') {
        /* If the focus is already on an input field, don't mess with it. */
        return;
    }

    if (ev.altKey || ev.metaKey || ev.ctrlKey) {
        /* Don't mess with command key combinations. This is not a perfect
           test, since option-key combos are ordinary (accented) characters
           on Mac keyboards, but it's close enough. */
        return;
    }

    var inputel = $('#eventinput');
    inputel.focus();

    if (keycode == KEY_RETURN) {
        /* Grab the Return/Enter key here. This is the same thing we'd do if
           the input field handler caught it. */
        submit_line_input(inputel.val());
        /* Safari drops an extra newline into the input field unless we call
           preventDefault() here. */
        ev.preventDefault();
        return;
    }

    if (keycode) {
        /* For normal characters, we fake the normal keypress handling by
           appending the character onto the end of the input field. If we
           didn't call preventDefault() here, Safari would actually do
           the right thing with the keystroke, but Firefox wouldn't. */
        /* This is completely wrong for accented characters (on a Mac
           keyboard), but that's beyond my depth. */
        if (keycode >= 32) {
            var val = String.fromCharCode(keycode);
            inputel.val(inputel.val() + val);
        }
        ev.preventDefault();
        return;
    }
}

var eventhistory = new Array();
var eventhistorypos = 0;
var eventlogging = false;

/* Event handler: keydown events on input fields (line input)

   Divert the up and down arrow keys to scroll through the command history
   for this window. */
function evhan_input_keydown(ev) {
  var keycode = 0;
  if (ev) keycode = ev.keyCode; //### ev.which?
  if (!keycode) return true;

  if (keycode == KEY_UP || keycode == KEY_DOWN) {
    if (keycode == KEY_UP && eventhistorypos > 0) {
      eventhistorypos -= 1;
      if (eventhistorypos < eventhistory.length)
        this.value = eventhistory[eventhistorypos];
      else
        this.value = '';
    }

    if (keycode == KEY_DOWN && eventhistorypos < eventhistory.length) {
      eventhistorypos += 1;
      if (eventhistorypos < eventhistory.length)
        this.value = eventhistory[eventhistorypos];
      else
        this.value = '';
    }

    return false;
  }

  return true;
}

/* Event handler: keypress events on input fields (line input)

   Divert the enter/return key to submit a line of input.
*/
function evhan_input_keypress(ev) {
    var keycode = 0;
    if (ev) keycode = ev.which;
    if (!keycode) return true;
    
    if (keycode == KEY_RETURN) {
        submit_line_input(this.value);
        return false;
    }
    
    return true;
}

function evhan_click_action(ev) {
    ev.preventDefault();

    var target = ev.data.target;
    websocket_send_json({ cmd:'action', action:target });
}

function evhan_click_dropfocus(ev) {
    ev.preventDefault();

    websocket_send_json({ cmd:'dropfocus' });
}

function handle_updown_resize(ev, ui) {
    var parentheight = $('#submain').height();
    $('#bottomcol').css({ height: parentheight - ui.size.height });
}

function handle_updown_doneresize(ev, ui) {
    var parentheight = $('#submain').height();
    var percent = 100.0 * ui.size.height / parentheight;
    if (percent < 25)
        percent = 25;
    if (percent > 85)
        percent = 85;
    var otherpercent = 100.0 - percent;
    $('#topcol').css({ height: percent+'%' });
    $('#bottomcol').css({ height: otherpercent+'%' });
}


function evhan_websocket_open() {
    if (!everconnected) {
        /* Good time for a welcome message. */
        eventpane_add(localize('client.eventpane.start'), 'EventMessage');
    }

    connected = true;
    everconnected = true;
}

function evhan_websocket_close(ev) {
    websocket = null;
    connected = false;

    if (ev.code === undefined && ev.reason === undefined) {
        display_error('The connection to the server could not be opened. Your web browser may contain an obsolete version of websockets. Try the most recent version of Safari, Firefox, or Chrome. (There have also been reports that Privoxy blocks websockets.)');
    }
    else if (!everconnected) {
        display_error('The connection to the server could not be opened. (' + ev.code + ',' + ev.reason + ')');
    }
    else {
        display_error('The connection to the server was lost. (' + ev.code + ',' + ev.reason + ')');
    }

    /* ### set up a timer to try reconnecting. But don't change the displayed
       error unless it succeeds? */
}

function evhan_websocket_message(ev) {
    //console.log(('### message: ' + ev.data).slice(0,100));
    var obj = null;
    var cmd = null;
    try {
        obj = JSON.parse(ev.data);
        cmd = obj.cmd;
    }
    catch (ex) {
        console.log('badly-formatted message from websocket: ' + ev.data);
        return;
    }

    var func = command_table[cmd];
    if (!func) {
        console.log('command not understood: ' + cmd);
        return;
    }

    func(obj);
}

function websocket_send_json(obj) {
    if (!connected) {
        /*### Maybe only show this error once. */
        eventpane_add('Error: You are not connected to the server.', 'EventError');
        console.log('websocket not connected');
        return;
    }

    var val = JSON.stringify(obj);
    websocket.send(val);

    /* Consider this "activity", for the purpose of when-idle notifications.
       (Perhaps this is the wrong place to do this?) */
    notify_clear();
}

/* Return the localization of a string, as defined in the db_localize table.
   (Which was set up for us by tweb, using the localize data from the
   database.)
*/
function localize(key) {
    var res = db_localize[key];
    if (res)
        return res;
    /* Not found. Return a terrible default that people will notice. */
    return '** ' + key + ' **';
}

/* Get the current time.
*/
function current_time_string() {
    var date = new Date();
    var res = [];

    res.push(''+date.getFullYear());
    res.push('/'+(date.getMonth()+1));
    res.push('/'+date.getDate());
    res.push(', ');

    var hr = date.getHours();
    if (hr == 0)
        res.push('12');
    else if (hr < 10)
        res.push('0'+hr);
    else if (hr <= 12)
        res.push(''+hr);
    else
        res.push(''+(hr-12));

    var min = date.getMinutes();
    if (min < 10)
        res.push(':0'+min);
    else
        res.push(':'+min);

    if (hr < 12)
        res.push(' am');
    else
        res.push(' pm');

    return res.join('');
}

/* The page-ready handler. Like onload(), but better, I'm told. */
$(document).ready(function() {
    build_page_structure();
    setup_event_handlers();
    open_websocket();
});
