// 内置常用镜像logo配置
// 格式: { "镜像名称": "logo 文件路径" }
// 支持镜像名称匹配，如 "nginx" 会匹配 "nginx:latest", "nginx:alpine" 等

// 导入图片资源
import MediaSaberLogo from '../assets/logos/media-saber.png';
import MoviepilotLogo from '../assets/logos/moviepilot.png';
import DockerCopilotLogo from '../assets/logos/docker-copilot.png';
import MTPhotos from '../assets/logos/mt-photos.png';
import ITToolsLogo from '../assets/logos/it-tools.webp';
import SubStoreLogo from '../assets/logos/sub-store.webp';
import JellyfinLogo from '../assets/logos/jellyfin.png';
import RedisLogo from '../assets/logos/redis.png';
import PostgresLogo from '../assets/logos/postgres.png';
import SunPanelLogo from '../assets/logos/sun-panel.png';
import QinglongLogo from '../assets/logos/qinglong.svg';
import TransmissionLogo from '../assets/logos/transmission.png';
import QBittorrentLogo from '../assets/logos/qbittorrent.webp';
import FnDeskLogo from '../assets/logos/fndesk.png';
import FNTVLogo from '../assets/logos/fntv.png';
import CookiecloudLogo from '../assets/logos/cookiecloud.png';
import CodeServerLogo from '../assets/logos/code-server.png';
import IYUULogo from '../assets/logos/iyuu.png';
import LuckyLogo from '../assets/logos/lucky.png';
import EmbyserverLogo from '../assets/logos/embyserver.png';
import AudiobookshelfLogo from '../assets/logos/audiobookshelf.png';
import MySQLLogo from '../assets/logos/mysql.png';
// 常见 Docker 服务图标（来源 Simple Icons，CC0）
import NginxLogo from '../assets/logos/nginx.svg';
import TraefikLogo from '../assets/logos/traefikproxy.svg';
import PortainerLogo from '../assets/logos/portainer.svg';
import GrafanaLogo from '../assets/logos/grafana.svg';
import PrometheusLogo from '../assets/logos/prometheus.svg';
import HomeAssistantLogo from '../assets/logos/homeassistant.svg';
import PlexLogo from '../assets/logos/plex.svg';
import NextcloudLogo from '../assets/logos/nextcloud.svg';
import SyncthingLogo from '../assets/logos/syncthing.svg';
import GiteaLogo from '../assets/logos/gitea.svg';
import MinioLogo from '../assets/logos/minio.svg';
import MongoDBLogo from '../assets/logos/mongodb.svg';
import MariaDBLogo from '../assets/logos/mariadb.svg';
import NPMLogo from '../assets/logos/nginxproxymanager.svg';
import UptimeKumaLogo from '../assets/logos/uptimekuma.svg';
import WatchtowerLogo from '../assets/logos/watchtower.svg';
import SonarrLogo from '../assets/logos/sonarr.svg';
import RadarrLogo from '../assets/logos/radarr.svg';
import ImmichLogo from '../assets/logos/immich.svg';
import AdGuardLogo from '../assets/logos/adguard.svg';
import PiHoleLogo from '../assets/logos/pihole.svg';
import NtfyLogo from '../assets/logos/ntfy.svg';

// 单色 SVG 图标（Simple Icons，默认黑）：深色模式下需要反色显示
const monoLogoSet = new Set([
  NginxLogo, TraefikLogo, PortainerLogo, GrafanaLogo, PrometheusLogo,
  HomeAssistantLogo, PlexLogo, NextcloudLogo, SyncthingLogo, GiteaLogo,
  MinioLogo, MongoDBLogo, MariaDBLogo, NPMLogo, UptimeKumaLogo,
  WatchtowerLogo, SonarrLogo, RadarrLogo, ImmichLogo, AdGuardLogo,
  PiHoleLogo, NtfyLogo,
]);

export const isMonochromeLogo = (url) => typeof url === 'string' && monoLogoSet.has(url);

export const builtInImageLogos = {
  "xylplm/media-saber": MediaSaberLogo,
  "jxxghp/moviepilot-v2": MoviepilotLogo,
  "0nlylty/dockercopilot": DockerCopilotLogo,
  "mtphotos/mt-photos": MTPhotos,
  "kqstone/mt-photos-insightface-unofficial": MTPhotos,
  "mtphotos/mt-photos-ai": MTPhotos,
  "corentinth/it-tools": ITToolsLogo,
  "xream/sub-store": SubStoreLogo,
  "nyanmisaka/jellyfin": JellyfinLogo,
  "redis": RedisLogo,
  "postgres": PostgresLogo,
  "hslr/sun-panel": SunPanelLogo,
  "whyour/qinglong": QinglongLogo,
  "linuxserver/transmission": TransmissionLogo,
  "linuxserver/qbittorrent": QBittorrentLogo,
  "imgzcq/fndesk": FnDeskLogo,
  "qiaokes/fntv-record-view": FNTVLogo,
  "easychen/cookiecloud": CookiecloudLogo,
  "codercom/code-server": CodeServerLogo,
  "iyuucn/iyuuplus": IYUULogo,
  "iyuucn/iyuuplus-dev-nodb": IYUULogo,
  "gdy666/lucky": LuckyLogo,
  "amilys/embyserver": EmbyserverLogo,
  "audiobookshelf": AudiobookshelfLogo,
  "mysql": MySQLLogo,
  // 常见 Docker 服务（特例键在前，防止宽泛子串误抢——如 nginx 抢占 nginx-proxy-manager）
  "jc21/nginx-proxy-manager": NPMLogo,
  "nginx-proxy-manager": NPMLogo,
  "louislam/uptime-kuma": UptimeKumaLogo,
  "uptime-kuma": UptimeKumaLogo,
  "containrrr/watchtower": WatchtowerLogo,
  "watchtower": WatchtowerLogo,
  "adguard/adguardhome": AdGuardLogo,
  "adguardhome": AdGuardLogo,
  "pihole/pihole": PiHoleLogo,
  "pihole": PiHoleLogo,
  "nginx": NginxLogo,
  "traefik": TraefikLogo,
  "portainer/portainer-ce": PortainerLogo,
  "portainer/portainer-ee": PortainerLogo,
  "portainer": PortainerLogo,
  "grafana/grafana": GrafanaLogo,
  "grafana": GrafanaLogo,
  "prom/prometheus": PrometheusLogo,
  "prometheus": PrometheusLogo,
  "homeassistant/home-assistant": HomeAssistantLogo,
  "homeassistant": HomeAssistantLogo,
  "plexinc/pms-docker": PlexLogo,
  "plex": PlexLogo,
  "nextcloud": NextcloudLogo,
  "syncthing/syncthing": SyncthingLogo,
  "syncthing": SyncthingLogo,
  "gitea/gitea": GiteaLogo,
  "gitea": GiteaLogo,
  "minio/minio": MinioLogo,
  "minio": MinioLogo,
  "mongo": MongoDBLogo,
  "mongodb": MongoDBLogo,
  "mariadb": MariaDBLogo,
  "linuxserver/sonarr": SonarrLogo,
  "sonarr": SonarrLogo,
  "linuxserver/radarr": RadarrLogo,
  "radarr": RadarrLogo,
  "ghcr.io/immich-app/immich-server": ImmichLogo,
  "immich": ImmichLogo,
  "binwiederhier/ntfy": NtfyLogo,
  "ntfy": NtfyLogo,
};

// 获取镜像的logo
// 优先级: 内置logo > 用户自定义 > 默认图标
export const getImageLogo = (imageName, customLogos = {}) => {
  // 先检查内置logo（优先级最高）
  const baseImageName = imageName.split(':')[0]; // 去掉tag部分

  // 优先匹配完整镜像名（包含 registry/namespace）
  if (builtInImageLogos[baseImageName]) {
    return builtInImageLogos[baseImageName];
  }

  // 尝试匹配最后一段镜像名（去掉 registry/namespace）
  const simpleName = baseImageName.split('/').pop();
  if (builtInImageLogos[simpleName]) {
    return builtInImageLogos[simpleName];
  }

  // 如果仍未匹配，使用关键字（子串）匹配
  for (const [key, url] of Object.entries(builtInImageLogos)) {
    if (!key) continue;
    try {
      if (baseImageName.includes(key) || simpleName.includes(key)) {
        return url;
      }
    } catch (e) {
      // 防御性代码：忽略任何异常并继续
    }
  }

  // 再检查用户自定义的logo
  if (customLogos[imageName]) {
    return customLogos[imageName];
  }
  if (customLogos[baseImageName]) {
    return customLogos[baseImageName];
  }
  if (customLogos[simpleName]) {
    return customLogos[simpleName];
  }

  // 没有找到logo，返回null
  return null;
};

// 获取所有支持的镜像名称列表
export const getSupportedImageNames = () => {
  return Object.keys(builtInImageLogos);
};

// 检查镜像是否有内置logo
export const hasBuiltInLogo = (imageName) => {
  const baseImageName = imageName.split(':')[0];
  if (builtInImageLogos[baseImageName]) return true;
  const simpleName = baseImageName.split('/').pop();
  if (builtInImageLogos[simpleName]) return true;

  // 关键字（子串）匹配
  for (const key of Object.keys(builtInImageLogos)) {
    if (!key) continue;
    try {
      if (baseImageName.includes(key) || simpleName.includes(key)) return true;
    } catch (e) {
      // 忽略并继续
    }
  }
  return false;
};