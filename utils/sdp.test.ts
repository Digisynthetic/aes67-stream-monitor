import assert from 'node:assert/strict';
import test from 'node:test';

import { createManualStreamId, parseSdp } from './sdp.ts';

test('parses AES67 SDP name, connection, audio port, and rtpmap details', () => {
  const result = parseSdp([
    'v=0',
    'o=- 0 0 IN IP4 192.168.1.10',
    's=111',
    'c=IN IP4 239.81.83.67/32',
    't=0 0',
    'm=audio 5004 RTP/AVP 97',
    'a=rtpmap:97 L24/48000/8',
  ].join('\n'));

  assert.deepEqual(result, {
    name: '111',
    ip: '239.81.83.67',
    port: 5004,
    channels: 8,
    sampleRate: 48000,
    format: 'L24',
    origin: '- 0 0 IN IP4 192.168.1.10',
    isMonitorable: true,
  });
});

test('accepts partial SDP without version and timing lines', () => {
  const result = parseSdp([
    's=Partial',
    'c=IN IP4 239.10.10.10/32',
    'm=audio 5006 RTP/AVP 97',
    'a=rtpmap:97 L24/96000/2',
  ].join('\n'));

  assert.equal(result.name, 'Partial');
  assert.equal(result.ip, '239.10.10.10');
  assert.equal(result.port, 5006);
  assert.equal(result.sampleRate, 96000);
  assert.equal(result.channels, 2);
  assert.equal(result.isMonitorable, true);
});

test('marks SDP without connection address as not monitorable', () => {
  const result = parseSdp([
    's=No Connection',
    'm=audio 5004 RTP/AVP 97',
    'a=rtpmap:97 L24/48000/8',
  ].join('\n'));

  assert.equal(result.ip, undefined);
  assert.equal(result.port, 5004);
  assert.equal(result.isMonitorable, false);
});

test('uses fallback IP when connection address is missing', () => {
  const result = parseSdp([
    's=Fallback',
    'm=audio 5004 RTP/AVP 97',
  ].join('\n'), '239.20.20.20');

  assert.equal(result.ip, '239.20.20.20');
  assert.equal(result.port, 5004);
  assert.equal(result.isMonitorable, true);
});

test('marks SDP with invalid audio media line as not monitorable', () => {
  const result = parseSdp([
    's=Invalid Media',
    'c=IN IP4 239.81.83.67/32',
    'm=audio not-a-port RTP/AVP 97',
  ].join('\n'));

  assert.equal(result.ip, '239.81.83.67');
  assert.equal(result.port, undefined);
  assert.equal(result.isMonitorable, false);
});

test('parses CRLF and LF input equivalently', () => {
  const lf = 's=Line Endings\nc=IN IP4 239.81.83.67/32\nm=audio 5004 RTP/AVP 97\na=rtpmap:97 L24/48000/8';
  const crlf = lf.replaceAll('\n', '\r\n');

  assert.deepEqual(parseSdp(crlf), parseSdp(lf));
});

test('creates distinct manual stream IDs for same IP with different ports', () => {
  const uniquePart = 12345;

  assert.notEqual(
    createManualStreamId('239.81.83.67', 5004, uniquePart),
    createManualStreamId('239.81.83.67', 5005, uniquePart),
  );
});
