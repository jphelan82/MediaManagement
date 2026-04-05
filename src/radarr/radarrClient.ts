import axios, { AxiosInstance } from 'axios';
import { RadarrMovie, RadarrRelease, QualityProfile, RootFolder, RadarrCommand } from './radarrTypes';
import logger from '../logger';

export class RadarrClient {
  private http: AxiosInstance;

  constructor(baseUrl: string, apiKey: string) {
    this.http = axios.create({
      baseURL: `${baseUrl}/api/v3`,
      headers: { 'X-Api-Key': apiKey },
      timeout: 30_000,
    });
  }

  async getMovies(): Promise<RadarrMovie[]> {
    const { data } = await this.http.get<RadarrMovie[]>('/movie');
    return data;
  }

  async getMovie(id: number): Promise<RadarrMovie> {
    const { data } = await this.http.get<RadarrMovie>(`/movie/${id}`);
    return data;
  }

  async getReleases(movieId: number): Promise<RadarrRelease[]> {
    logger.debug(`Searching releases for movie ${movieId}`);
    const { data } = await this.http.get<RadarrRelease[]>('/release', {
      params: { movieId },
    });
    return data;
  }

  async updateMovie(movie: RadarrMovie, moveFiles: boolean = true): Promise<RadarrMovie> {
    const { data } = await this.http.put<RadarrMovie>(
      `/movie/${movie.id}`,
      movie,
      { params: { moveFiles } },
    );
    return data;
  }

  async deleteMovieFile(movieFileId: number): Promise<void> {
    logger.info(`Deleting movie file ${movieFileId}`);
    await this.http.delete(`/moviefile/${movieFileId}`);
  }

  async searchMovie(movieIds: number[]): Promise<RadarrCommand> {
    const { data } = await this.http.post<RadarrCommand>('/command', {
      name: 'MoviesSearch',
      movieIds,
    });
    return data;
  }

  async getQualityProfiles(): Promise<QualityProfile[]> {
    const { data } = await this.http.get<QualityProfile[]>('/qualityprofile');
    return data;
  }

  async getRootFolders(): Promise<RootFolder[]> {
    const { data } = await this.http.get<RootFolder[]>('/rootfolder');
    return data;
  }
}
