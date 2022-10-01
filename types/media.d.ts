export interface ExternalService {
  additional_data?: any[];
  id: string;
  name: 'coub' | 'youtube' | 'etc';
}

export interface Video {
  type: 'video';
  data: {
    width: number;
    height: number;
    thumbnail: Media;
    external_service: ExternalService;
    time: number;
  };
}

export interface MediaData {
  uuid: string;
  width: number;
  height: number;
  size: number;
  type: string;
  color: string;
  hash: string;
  external_service: ExternalService;
}

export type Media = {
  type: string;
  data: MediaData;
};
