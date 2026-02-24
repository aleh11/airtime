export interface InternetStatus {
    ping_ms: number;
    connected: boolean;
    score: number;
}

export interface NtpStatus {
    synced: boolean;
    score: number;
    last_rx_seconds: number;
    server: string;
}

export interface ServicesStatus {
    txtempus_running: boolean;
    txtempus_service?: string | null;
    txtempus_duration?: number | null;
    txtempus_started_at?: string | null;
    txtempus_offset?: number | null;
    txtempus_remaining_seconds?: number;
}

export interface AppConfig {
    stealth_mode: boolean;
}

export interface SystemMetrics {
    cpu: {
        percent: number;
        per_core: number[];
        load_avg: number[];
    };
    memory: {
        total: number;
        available: number;
        percent: number;
        swap_percent: number;
    };
    disk: {
        total: number;
        used: number;
        percent: number;
    };
    temperature: number;
    uptime: number;
}

export interface SystemStatus {
    internet_status: InternetStatus;
    ntp_status: NtpStatus;
    services: ServicesStatus;
    app_config: AppConfig;
    system_time: string;
    git_commit?: string;
    git_branch?: string;
}

export interface RadioDetails {
    is_txtempus: boolean;
    service: string;
    duration: string;
    offset: string;
}

export interface CronJob {
    id: string;
    enabled: boolean;
    schedule: string;
    command: string;
    friendly_time: string;
    friendly_freq: string;
    radio_details: RadioDetails;
}

export interface RadioConfig {
    binary_path?: string;
    default_service: string;
    available_services: string[];
    default_duration_minutes: number;
    default_offset?: number;
    default_offset_enabled?: boolean;
    timezone_offset_minutes?: number;
}

export interface CronJobInput {
    id: string;
    command: string;
    time: string;
    frequency: string;
    enabled: boolean;
}

export interface TransmitRequest {
    service: string;
    duration: number;
}

export interface RadioConfigInput {
    default_service: string;
    default_duration_minutes: number;
    default_offset: number;
    default_offset_enabled?: boolean;
}

export enum ServiceType {
    DCF77 = "DCF77",
    WWVB = "WWVB",
    MSF = "MSF",
    JJY40 = "JJY40",
    JJY60 = "JJY60"
}
