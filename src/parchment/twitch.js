var client = new tmi.client({
	options: {
		debug: true
	},
	channels: [parchment.options.chat_channel]
});

var showEmotes = true;


function htmlEntities(html) {
	function it() {
		return html.map(function(n, i, arr) {
				if(n.length == 1) {
					return n.replace(/[\u00A0-\u9999<>\&]/gim, function(i) {
						   return '&#'+i.charCodeAt(0)+';';
						});
				}
				return n;
			});
	}
	var isArray = Array.isArray(html);
	if(!isArray) {
		html = html.split('');
	}
	html = it(html);
	if(!isArray) html = html.join('');
	return html;
}

function formatEmotes(text, emotes) {
	var splitText = text.split('');
	for(var i in emotes) {
		var e = emotes[i];
		for(var j in e) {
			var mote = e[j];
			if(typeof mote == 'string') {
				mote = mote.split('-');
				mote = [parseInt(mote[0]), parseInt(mote[1])];
				var length =  mote[1] - mote[0],
					empty = Array.apply(null, new Array(length + 1)).map(function() { return '' });
				splitText = splitText.slice(0, mote[0]).concat(empty).concat(splitText.slice(mote[1] + 1, splitText.length));
				splitText.splice(mote[0], 1, '<img class="emoticon" src="http://static-cdn.jtvnw.net/emoticons/v1/' + i + '/3.0">');
			}
		}
	}
	return htmlEntities(splitText).join('')
}

function submitGameInput(message) {
	runner.io.TextInput.input.val(message);
	runner.io.TextInput.submitLine();
}


// control modes: anarchy, democracy, legion
var mode = 'anarchy';
// recent votes, one per username
var democracyThresh = 10;
var democracyCommands = {};
// current leader of legion, if there is one
var legionThresh = 5;
var legionController = null;
// people who have chatted recently
var recentParticipants = {};
// timeout for which people are omitted from recent participants.
var activeTimeout = 1 * 60 * 1000; // 1 min
var modeInterval = 15 * 1000; // 15 sec

function handleGameInput(user, message) {
	if (mode == 'anarchy') {
		submitGameInput(message);
	} else if (mode == 'democracy') {
		democracyCommands[user] = message;
	} else if (mode == 'legion') {
		if (user == legionController) {
			submitGameInput(message);
		}
	}
}

// replace common shortcuts with commands, remove excess whitespace
function normalize(m) {
	var aliases = {
		'x': 'examine',
		'l': 'look',
		'i': 'inventory',
		'z': 'wait',
	};
	var f = m.match(/\S+/g).map(function(k) {
		return k in aliases ? aliases[k] : k; 
	});
	return f.join(' ');
}

function modeUpdate() {
	lastUpdate = Date.now();
	// update recent participants
	recentParticipants = _.pickBy(recentParticipants, function(d) {
		return (Date.now() - d) < activeTimeout;
	});

	var newMode = checkChangeMode();
	// do mode updates if needed
	if (mode == 'democracy') {
		// get top voted command (after normalization)
		var top = getTopVote();
		if (top) {
			console.log('democracy pick: ', top);
			submitGameInput(top[0]);
		}
		democracyCommands = {};
	} else if (mode == 'legion' || newMode == 'legion') {
		// find someone else to take over
		var newController = _.chain(recentParticipants).keys().without(legionController).sample().value();
		if (newController) {
			console.log('switching legion controller from ' + legionController + ' to ' + newController);
			legionController = newController;
		}
	}
	mode = newMode;
}

var lastUpdate = Date.now();
// call modeUpdate every X milliseconds
window.setInterval(modeUpdate, modeInterval);

function checkChangeMode() {
	var count = _.keys(recentParticipants).length;
	var oldMode = mode;
	if (count >= democracyThresh) {
		mode = 'democracy';
	} else if (count >= legionThresh) {
		mode = 'legion';
	} else {
		mode = 'anarchy';
	}
	if (oldMode != mode) {
		console.log('switching from ' + oldMode + ' to ' + mode);
	}
	return mode;
}

function getTopVote() {
	var counts = _.chain(democracyCommands).mapValues(normalize).values().countBy();
	var top = counts.toPairs().orderBy(function(c) {
		return c[1];
	}, 'desc').head().value();
	return top;
}

function updateChatStatus() {
	var timeLeft = Math.ceiling((modeInterval - (Date.now() - lastUpdate))/1000);
	var status = mode + ' (' + timeLeft + ')';
	if (mode == 'democracy') {
		var top = getTopVote();
		if (top) {
			status += ' [' + top[0] + ' (' + top[1] + ')' + ']';
		}
	} else if (mode == 'legion') {
		status += ' [' + legionController + ']';
	}
	$('#chat-status').text(status);
}

// set status line
updateChatStatus();
// call every 200 ms to update
window.setInterval(updateChatStatus, 200);

function handleChat(channel, user, message, self) {
	recentParticipants[user['display-name']] = new Date();
	if (message.length > 1 && message[0] == '!') {
		handleGameInput(user['display-name'], message.slice(1))
	}
	var chan = channel,
		name = user.username,
		chatLine = document.createElement('div'),
		chatChannel = document.createElement('span'),
		chatName = document.createElement('span'),
		chatColon = document.createElement('span'),
		chatMessage = document.createElement('span');
	
	chatLine.className = 'chat-line';
	chatLine.dataset.username = name;
	chatLine.dataset.channel = channel;
	
	if(user['message-type'] == 'action') {
		chatLine.className += ' chat-action';
	}
	
	chatChannel.className = 'chat-channel';
	chatChannel.innerHTML = chan;
	
	chatName.className = 'chat-name';
	//chatName.style.color = color;
	chatName.innerHTML = user['display-name'] || name;
	
	chatColon.className = 'chat-colon';
	
	chatMessage.className = 'chat-message';
	
	//chatMessage.style.color = color;
	chatMessage.innerHTML = showEmotes ? formatEmotes(message, user.emotes) : htmlEntities(message);
	
	//if(client.opts.channels.length > 1 && showChannel) chatLine.appendChild(chatChannel);
	//if(showBadges) chatLine.appendChild(badges(chan, user, self));
	chatLine.appendChild(chatName);
	chatLine.appendChild(chatColon);
	chatLine.appendChild(chatMessage);
	
	$( parchment.options.chat_container ).append(chatLine);
	
	//if(typeof fadeDelay == 'number') {
	//	setTimeout(function() {
	//			chatLine.dataset.faded = '';
	//	}, fadeDelay);
	//}
	
	if(chat.children.length > 40) {
		var oldMessages = [].slice.call(chat.children).slice(0, 1);
		for(var i in oldMessages) oldMessages[i].remove();
	}
}

client.addListener('message', handleChat);
client.connect();
