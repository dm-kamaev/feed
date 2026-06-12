import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosResponse } from 'axios';
import { SearchResponse } from './types';
import { ConfigService } from '@nestjs/config';

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

  search(query: string): Promise<AxiosResponse<SearchResponse>> {
    return this.httpService.axiosRef.get(`${this.API_BASE_URL}/search`, {
      params: { q: query },
      headers: { 'X-API-Token': this.API_TOKEN },
    });
  }
}
