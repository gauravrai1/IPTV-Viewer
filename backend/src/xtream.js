import axios from 'axios';

function getCredentials() {
  const url = process.env.XTREAM_URL?.replace(/\/$/, '');
  const username = process.env.XTREAM_USERNAME;
  const password = process.env.XTREAM_PASSWORD;
  if (!url || !username || !password) {
    throw new Error('XTREAM_URL, XTREAM_USERNAME, and XTREAM_PASSWORD must be set');
  }
  return { url, username, password };
}

async function playerApi(params) {
  const { url, username, password } = getCredentials();
  const { data } = await axios.get(`${url}/player_api.php`, {
    params: { username, password, ...params },
    timeout: 30000,
  });
  return data;
}

export const getVodStreams = () => playerApi({ action: 'get_vod_streams' });
export const getVodCategories = () => playerApi({ action: 'get_vod_categories' });
export const getVodInfo = (vodId) => playerApi({ action: 'get_vod_info', vod_id: vodId });
export const getSeries = () => playerApi({ action: 'get_series' });
export const getSeriesCategories = () => playerApi({ action: 'get_series_categories' });
export const getSeriesInfo = (seriesId) => playerApi({ action: 'get_series_info', series_id: seriesId });

export function buildMovieUrl(streamId, extension) {
  const { url, username, password } = getCredentials();
  return `${url}/movie/${username}/${password}/${streamId}.${extension}`;
}

export function buildEpisodeUrl(streamId, extension) {
  const { url, username, password } = getCredentials();
  return `${url}/series/${username}/${password}/${streamId}.${extension}`;
}
