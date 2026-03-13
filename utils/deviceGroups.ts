import { Aes67Device, DeviceGroupConfig, DeviceGroupKind, Stream } from '../types';

const GROUP_LIMIT = 8;

const buildGroupsForKind = (
  device: Aes67Device,
  kind: DeviceGroupKind,
  total: number,
  globalBase: number
): Stream[] => {
  if (total <= 0) return [];

  const groups: Stream[] = [];
  for (let start = 0; start < total; start += GROUP_LIMIT) {
    const count = Math.min(GROUP_LIMIT, total - start);
    const groupIndex = Math.floor(start / GROUP_LIMIT) + 1;
    const suffix = `${start + 1}-${start + count}`;
    const name = `${device.name} ${kind === 'analog' ? 'Analog' : 'Network'} ${groupIndex} (${suffix})`;

    const deviceGroupConfig: DeviceGroupConfig = {
      deviceId: device.devId,
      deviceIp: device.ip,
      deviceName: device.name,
      deviceModel: device.model,
      kind,
      start,
      count,
      total,
      phyChNumTx: device.phyChNumTx,
      chNumTx: device.chNumTx,
      globalStart: globalBase + start,
      pollingPort: 8999
    };

    groups.push({
      id: `aes67-group-${device.devId}-${kind}-${start}`,
      name,
      ip: device.ip,
      port: 8999,
      channels: count,
      sampleRate: 48000,
      format: 'JSON',
      sourceType: 'device-group',
      isOffline: !!device.offline,
      deviceGroupConfig
    });
  }

  return groups;
};

export const splitDeviceToGroups = (device: Aes67Device): Stream[] => {
  const analogGroups = buildGroupsForKind(device, 'analog', device.phyChNumTx, 0);
  const networkGroups = buildGroupsForKind(device, 'network', device.chNumTx, device.phyChNumTx);
  return [...analogGroups, ...networkGroups];
};
