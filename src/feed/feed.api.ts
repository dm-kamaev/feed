import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError, AxiosResponse } from 'axios';
import { SearchResponse } from './types';
import { ConfigService } from '@nestjs/config';
import { RateLimitException } from './exceptions/rate-limit.exception';

@Injectable()
export class FeedApi {
  private readonly API_TOKEN: string;
  private readonly API_BASE_URL: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.API_TOKEN = this.configService.get<string>('API_TOKEN')!;
    this.API_BASE_URL = this.configService.get<string>('API_BASE_URL')!;
  }

  async search(query: string): Promise<AxiosResponse<SearchResponse>> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${this.API_BASE_URL}/search`,
        {
          params: { q: query },
          headers: { 'X-API-Token': this.API_TOKEN },
          timeout: 20000,
        },
      );
      return response;
    } catch (error) {
      if (
        (error as AxiosError).isAxiosError &&
        (error as AxiosError).response?.status === 429
      ) {
        throw new RateLimitException();
      }
      throw error;
    }
  }
}
