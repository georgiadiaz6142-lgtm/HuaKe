export type Meta = {
  stage: string;
  requirement_parser_provider: "deterministic" | "model";
  requirement_parser_name: string | null;
  requirement_parser_configured: boolean;
  model_provider: string;
  model_name: string | null;
  model_configured: boolean;
  model_api_protocol: "openai_chat_completions";
  is_mock: boolean;
  development_security: boolean;
  lesson_model_provider: string;
  lesson_model_name: string;
  lesson_model_configured: boolean;
  lesson_response_format: "json_schema";
  lesson_thinking_mode: "disabled" | "enabled";
  artwork_spec_model_provider: string;
  artwork_spec_model_name: string;
  artwork_spec_model_configured: boolean;
  artwork_spec_response_format: "json_schema";
  artwork_spec_thinking_mode: "disabled" | "enabled";
  image_model_provider: "mock" | "aliyun_bailian";
  image_model_name: "qwen-image-3.0";
  image_model_region: "cn-beijing";
  image_model_configured: boolean;
  image_model_prompt_extend: false;
  image_model_output_count: 1;
  slide_plan_model_provider: string;
  slide_plan_model_name: string;
  slide_plan_model_configured: boolean;
  slide_plan_response_format: "json_schema";
  slide_plan_thinking_mode: "disabled" | "enabled";
  observation_source_provider: "disabled" | "wikimedia_commons";
};

export type AccountEntitlement = {
  plan_key: "experience" | "co_creator" | "institution";
  plan_name: string;
  status: "active" | "expired" | "disabled";
  course_limit: number | null;
  course_used: number;
  course_remaining: number | null;
  period_started_at: string | null;
  period_ends_at: string | null;
  queued_months: number;
  can_start_course_generation: boolean;
};

export type RedemptionCodeRecord = {
  id: string;
  reference: string;
  state: "available" | "redeemed" | "disabled" | "expired";
  plan_key: "co_creator";
  duration_months: number;
  course_limit: number;
  created_at: string;
  expires_at: string | null;
  redeemed_at: string | null;
  can_disable: boolean;
};

export type User = {
  id: string;
  auth_type: string;
  role: "user";
  status?: string;
  account_label: string;
  course_count: number;
  last_course_at: string | null;
  reentry_code_count: number;
  reentry_code_limit: number;
  reentry_code_remaining: number;
  can_create_reentry_code: boolean;
  entitlement: AccountEntitlement;
};

export type Course = {
  id: string;
  status: string;
  title: string;
  updated_at: string;
  pinned_at: string | null;
  working_input_spec_version_id: string | null;
  working_blueprint_version_id: string | null;
  working_lesson_version_id: string | null;
  working_artwork_spec_version_id: string | null;
  working_main_artwork_version_id: string | null;
  cover_thumbnail_url: string | null;
  working_step_sheet_version_id: string | null;
  working_slide_plan_version_id: string | null;
};

export type Job = {
  id: string;
  course_id: string;
  module_id: "P0-01" | "P0-03" | "P0-04" | "P0-08" | "P0-09" | "P0-10" | "P0-11";
  status:
    | "queued"
    | "running"
    | "validating"
    | "ready"
    | "submitting"
    | "submitted"
    | "polling"
    | "downloading"
    | "persisting"
    | "succeeded"
    | "outdated_result"
    | "provider_submission_unknown"
    | "provider_result_expired"
    | "failed";
  attempt_count: number;
  max_attempts: number;
  error_code: string | null;
  error_summary: string | null;
  result_ref_id: string | null;
  model_snapshot: Record<string, unknown>;
  usage: Record<string, unknown>;
};

export type AgeRange = { min: number; max: number };

export type InputSpecPayload = {
  theme: string | null;
  age: AgeRange | null;
  class_size: number | null;
  materials: string[];
  duration_minutes: number | null;
  duration_source: "user" | "default" | "missing";
  preferences: string[];
  artwork_mode: "main_plus_three_steps";
};

export type EditableInputSpecPayload = Pick<
  InputSpecPayload,
  "theme" | "age" | "class_size" | "duration_minutes" | "materials"
>;

export type ClarificationQuestion = {
  question_id: string;
  field:
    | "theme"
    | "age"
    | "class_size"
    | "materials"
    | "duration_minutes"
    | "preferences"
    | "course_intent";
  issue_type: "missing" | "ambiguity" | "out_of_scope" | "conflict";
  question: string;
  answer_hint: string | null;
  options: string[];
  required: boolean;
};

export type ProposedChange = {
  field: ClarificationQuestion["field"];
  previous_value: unknown;
  proposed_value: unknown;
  source: "current_user_input";
};

export type InputSpecVersion = {
  id: string;
  version_no: number;
  status: string;
  candidate_status: string;
  confirmation_state: "unconfirmed" | "confirmed";
  input_spec_draft: InputSpecPayload;
  missing_fields: string[];
  ambiguities: string[];
  out_of_scope_fields: string[];
  changed_fields: string[];
  clarification_questions: ClarificationQuestion[];
  proposed_changes: ProposedChange[];
  field_sources: Record<string, string>;
  confirmation_summary: string;
  warnings: string[];
  next_action: string;
  created_at: string;
  model_snapshot: Record<string, unknown>;
};

export type LearningObjective = {
  objective: string;
  observable_evidence: string;
};

export type CourseStage = {
  stage_id: string;
  name: string;
  minutes: number;
  teacher_action: string;
  child_action: string;
  stage_output: string;
  materials: string[];
  safety_notes: string[];
};

export type BlueprintPayload = {
  course_id: string;
  title: string;
  theme: string;
  audience: { age: AgeRange; class_size: number };
  duration_minutes: number;
  materials: string[];
  big_idea: string;
  learning_objectives: LearningObjective[];
  stages: CourseStage[];
  technique_path: string[];
  classroom_strategy: string[];
  differentiation_goals: string[];
  assessment_points: string[];
  visual_asset_plan: {
    main_artwork_count: 1;
    step_image_count: 3;
    consistency_requirement: string;
  };
};

export type BlueprintVersion = {
  id: string;
  version_no: number;
  status: "ready";
  candidate_status: string;
  confirmation_state: "unconfirmed" | "confirmed";
  confirmed_at: string | null;
  source_input_spec_version_id: string;
  course_blueprint_draft: BlueprintPayload;
  decision_summary: string[];
  warnings: string[];
  next_action: string;
  created_at: string;
  model_snapshot: Record<string, unknown>;
};

export type NextStage = {
  module_id: "P0-04";
  name: "lesson_generator";
  status: "started";
  trigger: "automatic";
};

export type LessonPreparation = {
  teacher: string[];
  per_student: string[];
  shared: string[];
  setup_notes: string[];
};

export type LessonDifferentiation = {
  support: string[];
  extension: string[];
};

export type LessonStage = {
  stage_id: string;
  name: string;
  minutes: number;
  purpose: string;
  teacher_actions: string[];
  teacher_talking_points: string[];
  child_actions: string[];
  observation_points: string[];
  materials: string[];
  safety_notes: string[];
  render_hints: string[];
};

export type LessonPackagePayload = {
  title: string;
  overview: string;
  learning_objectives: LearningObjective[];
  preparation: LessonPreparation;
  stages: LessonStage[];
  differentiation: LessonDifferentiation;
  assessment: string[];
  cleanup_and_closure: string[];
};

export type LessonPackage = {
  schema_version: "0.1";
  module_id: "P0-04";
  status: "success";
  lesson_package_draft: LessonPackagePayload;
  source_refs: string[];
  dependency_versions: Record<string, string>;
  decision_summary: string[];
  warnings: string[];
  next_action: "persist_and_await_lesson_confirmation";
};

export type LessonVersion = {
  id: string;
  version_no: number;
  status: "ready";
  freshness_status: "current" | "outdated";
  confirmation_state: "unconfirmed" | "confirmed";
  confirmed_at: string | null;
  source_blueprint_version_id: string;
  source_input_spec_version_id: string;
  lesson_package: LessonPackage;
  model_snapshot: Record<string, unknown>;
  created_at: string;
};

export type EditableLessonStage = Omit<LessonStage, "stage_id" | "name" | "minutes">;

export type EditableLessonPayload = {
  overview: string;
  preparation: LessonPreparation;
  stages: EditableLessonStage[];
  differentiation: LessonDifferentiation;
  assessment: string[];
  cleanup_and_closure: string[];
};

export type DownstreamHandoff = {
  lesson_version_id: string;
  status: "artwork_spec_generation_started";
  auto_started: true;
};

export type ArtworkCanvas = {
  orientation: "portrait" | "landscape" | "square";
  aspect_ratio: string;
};

export type ArtworkComposition = {
  foreground: string;
  midground: string;
  background: string;
  focal_point: string;
  shape_complexity: string;
};

export type ArtworkMaterialExpression = {
  material: string;
  techniques: string[];
  feasibility_notes: string[];
};

export type ArtworkLayerPlanItem = {
  step: 1 | 2 | 3;
  learning_increment: string;
  visible_result: string;
};

export type ArtworkConsistencyAnchors = {
  fixed_composition: string[];
  fixed_subject_geometry: string[];
  fixed_palette: string[];
  fixed_material_texture: string[];
  allowed_step_changes: string[];
};

export type ArtworkSpecUserControls = {
  canvas_preset: "landscape_4_3" | "portrait_3_4" | "square_1_1";
  story_direction: string;
  subject_position: "left" | "center" | "right";
  view_distance: "close" | "medium" | "wide";
  scene_complexity: "simple" | "moderate";
  color_mood:
    | "preserve_current"
    | "cool_with_warm_focus"
    | "warm_with_cool_balance"
    | "bright_cheerful"
    | "soft_harmony";
  accent_colors: string[];
  creative_preferences: string[];
  avoid_elements: string[];
};

export type MainArtworkSpecPayload = {
  artwork_mode: "main_plus_three_steps";
  main_artwork_count: 1;
  step_image_count: 3;
  canvas: ArtworkCanvas;
  teaching_intent: string;
  subject_and_story: string;
  composition: ArtworkComposition;
  material_expression: ArtworkMaterialExpression;
  palette: string[];
  layer_plan: ArtworkLayerPlanItem[];
  consistency_anchors: ArtworkConsistencyAnchors;
  generation_brief: string;
  negative_constraints: string[];
  copyright_and_safety_notes: string[];
  user_controls: ArtworkSpecUserControls;
};

export type MainArtworkSpec = {
  schema_version: "0.1";
  module_id: "P0-08";
  status: "success";
  main_artwork_spec: MainArtworkSpecPayload;
  source_refs: string[];
  dependency_versions: Record<string, string>;
  decision_summary: string[];
  warnings: string[];
  next_action: "persist_and_await_artwork_spec_confirmation";
};

export type ArtworkSpecVersion = {
  id: string;
  version_no: number;
  status: "ready";
  freshness_status: "current" | "outdated";
  confirmation_state: "unconfirmed" | "confirmed";
  confirmed_at: string | null;
  source_input_spec_version_id: string;
  source_blueprint_version_id: string;
  source_lesson_version_id: string;
  main_artwork_spec: MainArtworkSpec;
  model_snapshot: Record<string, unknown>;
  created_at: string;
};

export type EditableMainArtworkSpecPayload = ArtworkSpecUserControls;

export type ArtworkSpecDownstreamHandoff = {
  artwork_spec_version_id: string;
  status: "ready_for_future_main_artwork_generation";
  auto_started: false;
};

export type GenerationQuote = {
  quote_id: string;
  expires_at: string;
};

export type MainArtworkVersion = {
  id: string;
  version_no: number;
  status: "ready";
  freshness_status: "current" | "outdated";
  confirmation_state: "unconfirmed" | "confirmed";
  confirmed_at: string | null;
  asset: {
    id: string;
    content_url: string;
    mime_type: "image/png";
    width: number;
    height: number;
    ai_generated: true;
    ai_label: "AI 生成主范画";
  };
  artwork_spec_version_id: string;
  spec_summary: {
    orientation: "portrait" | "landscape" | "square";
    aspect_ratio: string;
    material: string;
    subject_and_story: string;
    palette: string[];
  };
  usage_limit: {
    successful_versions: number;
    max_successful_versions: 3;
    can_generate: boolean;
  };
  model: {
    provider: "aliyun_bailian" | "mock";
    name: "qwen-image-3.0";
    region: "cn-beijing";
    is_mock: boolean;
  };
  created_at: string;
};

export type MainArtworkDownstreamHandoff = {
  main_artwork_version_id: string;
  asset_id: string;
  status: "ready_for_future_step_image_generation";
  auto_started: false;
};

export type StepSheetPanel = {
  step_index: 1 | 2 | 3;
  position: "left" | "center" | "right";
  render_mode:
    | "line_art_only"
    | "flat_base_colors_only"
    | "pencil_construction_sketch"
    | "background_only_subject_blank"
    | "confirmed_main_artwork_reference"
    | "line_art_or_light_underpainting"
    | "base_color_blocks"
    | "near_finished_reference"
    | "legacy_unspecified";
  color_coverage_ceiling_percent: 0 | 20 | 100 | null;
  background_fill: "forbidden" | "allowed" | "unspecified";
  teaching_action: string;
  visible_result: string;
};

export type StepSheetVersion = {
  id: string;
  version_no: number;
  status: "ready";
  freshness_status: "current" | "outdated";
  confirmation_state: "unconfirmed" | "confirmed";
  confirmed_at: string | null;
  asset: {
    id: string;
    content_url: string;
    mime_type: "image/png";
    width: 2048;
    height: 768;
    ai_generated: true;
    ai_label: "AI 生成三联步骤图";
  };
  main_artwork_version_id: string;
  artwork_spec_version_id: string;
  panels: StepSheetPanel[];
  usage_limit: {
    successful_versions: number;
    max_successful_versions: 2;
    can_regenerate: boolean;
  };
  model: {
    provider: "aliyun_bailian" | "mock";
    name: "qwen-image-3.0";
    region: "cn-beijing";
    is_mock: boolean;
  };
  created_at: string;
};

export type StepSheetDownstreamHandoff = {
  step_sheet_version_id: string;
  asset_id: string;
  status: "ready_for_future_presentation_planning";
  auto_started: false;
};

export type SlideElement = {
  element_id: string;
  element_type: "text" | "image" | "shape" | "badge" | "highlight";
  layout: { x: number; y: number; w: number; h: number };
  z_index: number;
  editable: boolean;
  text: string | null;
  asset_key: "main_artwork" | "step_sheet" | "observation_01" | "observation_02" | null;
  image_fit: "contain" | "cover" | null;
  alt_text: string | null;
  style_token: string;
  highlight_region: [number, number, number, number] | null;
};

export type SlidePlanSlide = {
  slide_id: string;
  slide_no: number;
  slide_type: string;
  title: string;
  teaching_purpose: string;
  elements: SlideElement[];
  speaker_notes: string[];
  animation_intents: Array<{
    element_id: string;
    effect: "appear" | "fade" | "wipe" | "zoom";
    trigger: "on_click" | "with_previous";
    order: number;
  }>;
  optional: boolean;
};

export type SlidePlanAsset = {
  asset_id: string;
  url: string;
  mime_type: "image/png" | "image/jpeg";
  width: number;
  height: number;
  origin_type: "generated" | "retrieved" | "user_uploaded";
  source_provider: string | null;
  source_page_url: string | null;
  creator_name: string | null;
  attribution_text: string | null;
  license_id: string | null;
  license_url: string | null;
};

type SlidePlanVersionBase = {
  id: string;
  version_no: number;
  status: "ready";
  freshness_status: "current" | "outdated";
  confirmation_state: "unconfirmed" | "confirmed";
  confirmed_at: string | null;
  source_step_sheet_version_id: string;
  upgrade_available: boolean;
  read_only: boolean;
  assets: Record<string, SlidePlanAsset>;
  generation_usage: { used: number; limit: 2; remaining: number };
  model_snapshot: Record<string, unknown>;
  created_at: string;
};

export type LegacySlidePlanVersionV01 = SlidePlanVersionBase & {
  schema_version: "0.1";
  slide_plan: {
    schema_version: "0.1";
    module_id: "P0-11";
    status: "success";
    slide_plan: {
      title: string;
      slide_count: number;
      slides: SlidePlanSlide[];
      asset_references: string[];
      render_requirements: Record<string, string>;
    };
    decision_summary: string[];
    warnings: string[];
    next_action: "persist_and_await_slide_plan_confirmation";
  };
};

export type SlidePlanSlotIdV02 =
  | "cover"
  | "hook_and_goals"
  | "observe_form"
  | "observe_color_texture"
  | "professional_observation"
  | "technique_and_safety"
  | "step_1"
  | "step_2"
  | "step_3"
  | "creative_variation"
  | "creation_task"
  | "sharing_and_assessment";

export type SemanticSlideSlotV02 = {
  title: string;
  core_message: string;
  visible_points: string[];
  teacher_notes: string[];
  teaching_role: string;
  animation_intent: "none" | "reveal_points" | "reveal_observations" | "reveal_steps";
};

export type SemanticSlidePlanSlotsV02 = Record<SlidePlanSlotIdV02, SemanticSlideSlotV02>;

export type RenderElementV01 = {
  element_id: string;
  element_type: "text" | "image" | "shape";
  x: number;
  y: number;
  w: number;
  h: number;
  z_index: number;
  editable: boolean;
  text: string | null;
  text_style: null | {
    font_family: string;
    font_size: number;
    font_weight: number;
    line_height: number;
    color: string;
    align: "left" | "center" | "right";
    vertical_align: "top" | "middle" | "bottom";
  };
  shape_style: null | {
    fill: string;
    stroke: string;
    stroke_width: number;
    corner_radius: number;
    opacity: number;
  };
  asset_key: "main_artwork" | "step_sheet" | "observation_01" | "observation_02" | null;
  image_fit: "contain" | "cover" | null;
  source_rect: null | { x: number; y: number; w: number; h: number };
  alt_text: string | null;
};

export type RenderSlideSpecV01 = {
  slot_id: SlidePlanSlotIdV02;
  slide_id: string;
  elements: RenderElementV01[];
  speaker_notes: string[];
  animation_plan: Array<{
    element_id: string;
    effect: "appear" | "fade" | "wipe" | "zoom";
    trigger: "on_click" | "with_previous";
    order: number;
  }>;
};

export type SlidePlanVersionV02 = SlidePlanVersionBase & {
  schema_version: "0.2";
  slide_plan: {
    schema_version: "0.2";
    module_id: "P0-11";
    status: "success";
    semantic_plan: {
      schema_version: "0.2";
      module_id: "P0-11";
      status: "success";
      slots: SemanticSlidePlanSlotsV02;
      observation_search_queries: string[];
      dependency_versions: Record<string, string>;
      decision_summary: string[];
      warnings: string[];
      next_action: "compile_and_persist_slide_plan";
    };
    render_deck_spec: {
      schema_version: "0.1";
      canvas_width: 1600;
      canvas_height: 900;
      coordinate_unit: "px";
      design_system_id: "huake.clean_studio";
      design_system_version: "1.0.0" | "1.0.1" | "1.1.0";
      design_system_hash: string;
      layout_compiler_version: string;
      asset_bindings: Array<{
        asset_key: string;
        asset_id: string;
        usage_role: string;
        sha256: string;
        width: number;
        height: number;
      }>;
      slides: RenderSlideSpecV01[];
      spec_hash: string;
    };
    source_policy_snapshot: Record<string, unknown>;
    decision_summary: string[];
    warnings: string[];
    next_action: "persist_and_await_slide_plan_confirmation";
  };
};

export type SlidePlanVersion = LegacySlidePlanVersionV01 | SlidePlanVersionV02;

export type EditableSemanticSlidePlanV02 = {
  schema_version: "0.2";
  slots: SemanticSlidePlanSlotsV02;
};

export type SlidePlanDownstreamHandoff = {
  slide_plan_version_id: string;
  status: "ready_for_presentation";
  auto_started: false;
};

export type CoursePresentation = {
  status: "ready_for_presentation";
  course_id: string;
  slide_plan_version: SlidePlanVersionV02;
};

export type CourseFeedbackRating =
  | "ready_to_use"
  | "needs_adjustment"
  | "not_usable";

export type CourseFeedbackIssueTag =
  | "lesson"
  | "main_artwork"
  | "step_sheet"
  | "observation_asset"
  | "presentation";

export type CourseFeedback = {
  id: string;
  course_id: string;
  slide_plan_version_id: string;
  rating: CourseFeedbackRating;
  issue_tags: CourseFeedbackIssueTag[];
  comment: string | null;
  created_at: string;
  updated_at: string;
};
