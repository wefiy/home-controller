var utils = require('./utils');
var Q = require('q');
var events = require('events');
var util = require('util');
var toByte = utils.toByte;
var debug = require('debug')('home-controller:insteon:light');

function Light(id, insteon) {
  this.id = id;
  this.insteon = insteon;

  this.emitOnAck = true;
}

util.inherits(Light, events.EventEmitter);

Light.prototype.turnOn = function (level, rate, next) {
  var id = this.id;
  if (typeof rate === 'function') {
    next = rate;
    rate = null;
  } else if (typeof level === 'function') {
    next = level;
    level = 100;
    rate = null;
  } else if (level === undefined){
    level = 100;
    rate = null;
  }
  if (rate !== null && rate !== undefined) {
    switch(rate) {
    case 'slow':
      rate = 47000;
      break;
    case 'fast':
      rate = 100;
      break;
    }

    var rampAndLevel = utils.levelToHexHalfByte(level) + utils.rampRateToHexHalfByte(rate);
    return this.insteon.directCommand(id, '2E', rampAndLevel, next);
  } else {
    return this.insteon.directCommand(id, '11', utils.levelToHexByte(level), next);
  }
};

/**
 * Turn Light On fast (no ramp) to 100%
 *
 * 12 -- ON FAST command
 *
 * @param  {String}   id
 * @param  {Function} next
 */
Light.prototype.turnOnFast = function (next) {
  return this.insteon.directCommand(this.id, '12', next);
};

/**
 * Turn Light Off
 *
 * 13 -- OFF command
 *
 * @param  {String}   id
 * @param  {Function} next
 */
Light.prototype.turnOff = function (rate, next) {
  var id = this.id;
  if (typeof rate === 'function') {
    next = rate;
    rate = null;
  }
  if (rate !== null && rate !== undefined) {
    switch(rate) {
    case 'slow':
      rate = 47000; // 47 sec in msec
      break;
    case 'fast':
      rate = 100; // .1 sec in msec
      break;
    }

    var rampAndLevel = '0' + utils.rampRateToHexHalfByte(rate);
    return this.insteon.directCommand(id, '2F', rampAndLevel, next);
  } else {
    return this.insteon.directCommand(id, '13', next);
  }
};


/**
 * Turn Light Off fast (no ramp)
 *
 * 13 -- OFF command
 *
 * @param  {String}   id
 * @param  {Function} next
 */
Light.prototype.turnOffFast = function (next) {
  return this.insteon.directCommand(this.id, '14', next);
};


/**
 * Brighten Light
 *
 * 15 -- Brighten command
 *
 * @param  {String}   id
 * @param  {Function} next
 */
Light.prototype.brighten = function (next) {
  return this.insteon.directCommand(this.id, '15', next);
};

/**
 * Dim Light
 *
 * 16 -- Dim command
 *
 * @param  {String}   id
 * @param  {Function} next
 */
Light.prototype.dim = function (next) {
  return this.insteon.directCommand(this.id, '16', next);
};


/**
 * Light Instant Change
 * Check for light level.
 *
 * 19 -- STATUS command
 *
 * 21 -- Instant Change command
 *
 * @param  {String}   id
 * @param  {Number}   level
 * @param  {Function} next
 */
Light.prototype.level = function (level, next) {
  if (typeof level === 'function') {
    next = level;
    level = null;
  }

  var id = this.id;

  if (level){
    return this.insteon.directCommand(id, '21', utils.levelToHexByte(level), next);
  } else {
    var deferred = Q.defer();
    deferred.resolve(
      this.insteon.directCommand(id, '19')
      .then(function (status) {

        if(!status || !status.response || !status.response.standard) {
          debug('No response for level request for device %s', id);
          return null;
        }

        var level = Math.ceil(parseInt(status.response.standard.command2, 16) * 100 / 255);
        return level;
      })
    );
    return deferred.promise.nodeify(next);
  }
};

Light.prototype.rampRate = function (btn, rate, next) {
  if (typeof btn === 'function') {
    next = btn;
    btn = 1;
    rate = null;
  } else if (typeof rate === 'function') {
    next = rate;
    rate = btn;
    btn = 1;
  }
  if(!btn) {
    btn = 1;
  }
  var id = this.id;

  var cmd = {cmd1: '2E', cmd2: '00', extended: true};

  btn = toByte(btn);

  if (rate) {
    cmd.userData = [btn, '05', utils.rampRateToHexByte(rate)];

    return this.insteon.directCommand(id, cmd, next);

  } else {

    cmd.userData = [btn];
    var deferred = Q.defer();
    deferred.resolve(
      this.insteon.directCommand(id, cmd)
      .then(function (status) {
        if(!status || !status.response || !status.response.extended) {
          debug('No response for ramp rate request for device %s', id);
          return null;
        }
        return utils.byteToRampRate(status.response.extended.userData[6]);
      })
    );
    return deferred.promise.nodeify(next);
  }
};

Light.prototype.onLevel = function (btn, level, next) {
  if (typeof btn === 'function') {
    next = btn;
    btn = 1;
    level = null;
  } else if (typeof level === 'function') {
    next = level;
    level = btn;
    btn = 1;
  }
  if(!btn) {
    btn = 1;
  }

  var id = this.id;

  var cmd = {cmd1: '2E', cmd2: '00', extended: true};

  btn =toByte(btn);


  if (level) {
    cmd.userData = [btn, '06', utils.levelToHexByte(level)];

    return this.insteon.directCommand(id, cmd, next);

  } else {
    cmd.userData = [btn];

    var deferred = Q.defer();
    deferred.resolve(
      this.insteon.directCommand(id, cmd)
      .then(function (status) {
        if(!status || !status.response || !status.response.extended) {
          debug('No response for on level request for device %s', id);
          return null;
        }

        level = utils.byteToLevel(status.response.extended.userData[7]);
        return level;
      })
    );
    return deferred.promise.nodeify(next);
  }
};


Light.prototype.handleAllLinkBroadcast = function (group, cmd1, cmd2) {

  debug('Emitting BC command for device (%s) - group: %s, cmd1: %s, cmd2: %s', this.id, group, cmd1, cmd2);
  this.emit('command', group, cmd1, cmd2);

  switch (cmd1) {
  case '11':
    this.emit('turnOn', group);
    break;
  case '12':
    this.emit('turnOnFast', group);
    break;
  case '13':
    this.emit('turnOff', group);
    break;
  case '14':
    this.emit('turnOffFast', group);
    break;
  case '17':
    if(cmd2 === '00') {
      this.dimming = true;
      this.emit('dimming', group);
    } else {
      this.dimming = false;
      this.emit('brightening', group);
    }
    break;
  case '18':
    if(this.dimming) {
      this.emit('dimmed', group);
    } else {
      this.emit('brightened', group);
    }
    break;
  default:
    debug('No event for command - %s', cmd1);
  }
};

Light.prototype.handleAck = function (cmd1, cmd2) {

  if(!this.emitOnAck) {
    return;
  }

  debug('Emitting ACK command for device (%s) - cmd1: %s, cmd2: %s', this.id, cmd1, cmd2);
  var group = null; // act doesn't have group

  this.emit('command', group, cmd1, cmd2);
  switch (cmd1) {
  case '11': // turnOn
  case '21': // level
    this.emit('turnOn', group, Math.ceil(parseInt(cmd2, 16) * 100 / 255));
    break;
  case '12': // turnOnFast
    this.emit('turnOnFast', group);
    break;
  case '2E': // turnOn at rampandlevel
    this.emit('turnOn', group, Math.ceil(parseInt(cmd2.substring(0,1), 16) * 100 / 15));
    break;
  case '13': // turnOff
  case '14': // turnOffFast
  case '2F': // turnOff at ramp
    this.emit('turnOff', group);
    break;
  case '15': // brighten
    this.emit('brightened', group);
    break;
  case '16': // dim
    this.emit('dimmed', group);
    break;
  default:
    debug('No event for command - %s', cmd1);
  }

};


module.exports = Light;
