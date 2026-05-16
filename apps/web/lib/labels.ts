import type { ConstructionType, ProjectStatus, ProjectType } from '@kgk/schemas';

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  bidding: '受注前',
  in_progress: '施工中',
  completed: '完工',
  billing: '請求中',
  closed: '完了',
};

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  public: '公共',
  private: '民間',
};

export const CONSTRUCTION_TYPE_LABELS: Record<ConstructionType, string> = {
  civil: '土木',
  building: '建築',
  renovation: '改修',
};
