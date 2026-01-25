import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from './constants';

// 模型分组配置文件路径
export const MODEL_GROUPS_FILE = path.join(DATA_DIR, "model_groups.json");

/**
 * 模型信息接口
 */
export interface ModelInfo {
    name: string;          // 模型名称 (如 "Claude Opus 4.5 (Thinking)")
    resetTime: string;     // 重置时间
    percentage: number;    // 剩余配额百分比
}

/**
 * 模型分组接口
 */
export interface ModelGroup {
    id: string;            // 分组唯一ID
    name: string;          // 分组名称 (如 "Claude", "Gemini 3 Pro")
    models: string[];      // 分组内的模型名称列表
    createdAt: number;     // 创建时间戳
    updatedAt: number;     // 更新时间戳
}

/**
 * 分组配置接口
 */
export interface ModelGroupsConfig {
    groups: ModelGroup[];
    lastAutoGrouped: number | null;  // 上次自动分组时间
}

/**
 * 模型分组管理器
 */
export class ModelGroupManager {

    /**
     * 加载分组配置
     */
    static loadGroups(): ModelGroupsConfig {
        if (!fs.existsSync(MODEL_GROUPS_FILE)) {
            return { groups: [], lastAutoGrouped: null };
        }
        try {
            return JSON.parse(fs.readFileSync(MODEL_GROUPS_FILE, 'utf8'));
        } catch (e) {
            console.error('Failed to load model groups', e);
            return { groups: [], lastAutoGrouped: null };
        }
    }

    /**
     * 保存分组配置
     */
    static saveGroups(config: ModelGroupsConfig): void {
        const dir = path.dirname(MODEL_GROUPS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(MODEL_GROUPS_FILE, JSON.stringify(config, null, 2), 'utf8');
    }

    /**
     * 创建新分组
     */
    static createGroup(name: string, models: string[] = []): ModelGroup {
        const now = Date.now();
        return {
            id: `group_${now}_${Math.random().toString(36).substring(2, 8)}`,
            name,
            models,
            createdAt: now,
            updatedAt: now
        };
    }

    /**
     * 添加分组
     */
    static addGroup(config: ModelGroupsConfig, group: ModelGroup): ModelGroupsConfig {
        return {
            ...config,
            groups: [...config.groups, group]
        };
    }

    /**
     * 更新分组
     */
    static updateGroup(config: ModelGroupsConfig, groupId: string, updates: Partial<ModelGroup>): ModelGroupsConfig {
        return {
            ...config,
            groups: config.groups.map(g =>
                g.id === groupId
                    ? { ...g, ...updates, updatedAt: Date.now() }
                    : g
            )
        };
    }

    /**
     * 删除分组
     */
    static deleteGroup(config: ModelGroupsConfig, groupId: string): ModelGroupsConfig {
        return {
            ...config,
            groups: config.groups.filter(g => g.id !== groupId)
        };
    }

    /**
     * 向分组添加模型
     */
    static addModelToGroup(config: ModelGroupsConfig, groupId: string, modelName: string): ModelGroupsConfig {
        return {
            ...config,
            groups: config.groups.map(g => {
                if (g.id === groupId && !g.models.includes(modelName)) {
                    return { ...g, models: [...g.models, modelName], updatedAt: Date.now() };
                }
                return g;
            })
        };
    }

    /**
     * 从分组移除模型
     */
    static removeModelFromGroup(config: ModelGroupsConfig, groupId: string, modelName: string): ModelGroupsConfig {
        return {
            ...config,
            groups: config.groups.map(g => {
                if (g.id === groupId) {
                    return { ...g, models: g.models.filter(m => m !== modelName), updatedAt: Date.now() };
                }
                return g;
            })
        };
    }

    /**
     * 自动分组 - 根据模型前缀和重置时间进行智能分组
     * 只有配额和重置时间相同的模型可归入同一分组
     */
    static autoGroup(models: ModelInfo[]): ModelGroup[] {
        const groups: Map<string, ModelGroup> = new Map();
        const now = Date.now();

        for (const model of models) {
            // 提取模型系列名称 (如 "Claude", "Gemini")
            const seriesName = this.extractSeriesName(model.name);

            // 创建分组键：系列名称 + 重置时间
            const groupKey = `${seriesName}_${model.resetTime || 'unknown'}`;

            if (!groups.has(groupKey)) {
                groups.set(groupKey, {
                    id: `group_${now}_${Math.random().toString(36).substring(2, 8)}`,
                    name: seriesName,
                    models: [],
                    createdAt: now,
                    updatedAt: now
                });
            }

            const group = groups.get(groupKey)!;
            if (!group.models.includes(model.name)) {
                group.models.push(model.name);
            }
        }

        // 转换为数组并合并同名分组
        const groupsArray = Array.from(groups.values());
        const mergedGroups: Map<string, ModelGroup> = new Map();

        for (const group of groupsArray) {
            if (mergedGroups.has(group.name)) {
                // 如果已有同名分组，需要判断是否合并
                // 根据截图逻辑：只有配额和重置时间相同才能合并
                // 这里我们保留独立分组，但添加编号
                let count = 2;
                let newName = `${group.name} ${count}`;
                while (mergedGroups.has(newName)) {
                    count++;
                    newName = `${group.name} ${count}`;
                }
                group.name = newName;
            }
            mergedGroups.set(group.name, group);
        }

        return Array.from(mergedGroups.values());
    }

    /**
     * 提取模型系列名称
     */
    private static extractSeriesName(modelName: string): string {
        const lowerName = modelName.toLowerCase();
        const normalized = lowerName.replace(/(\d+)-(\d+)/g, '$1.$2');

        // Claude 系列 — handle all versions dynamically
        if (normalized.includes('claude') || normalized.includes('opus') || normalized.includes('sonnet') || normalized.includes('haiku')) {
            const versionMatch = normalized.match(/(\d+(?:\.\d+)?)/);
            const version = versionMatch ? versionMatch[1] : '';
            
            let subType = '';
            if (normalized.includes('opus')) { subType = 'Opus'; }
            else if (normalized.includes('sonnet')) { subType = 'Sonnet'; }
            else if (normalized.includes('haiku')) { subType = 'Haiku'; }
            
            if (version && subType) {
                return `Claude ${subType} ${version}`;
            }
            if (subType) {
                return `Claude ${subType}`;
            }
            if (version) {
                return `Claude ${version}`;
            }
            return 'Claude';
        }

        // Gemini 系列
        if (normalized.includes('gemini')) {
            const versionMatch = normalized.match(/(\d+(?:\.\d+)?)/);
            const version = versionMatch ? versionMatch[1] : '';
            
            let subType = '';
            if (normalized.includes('pro')) { subType = 'Pro'; }
            else if (normalized.includes('flash')) { subType = 'Flash'; }
            
            if (version && subType) {
                return `Gemini ${version} ${subType}`;
            }
            if (version) {
                return `Gemini ${version}`;
            }
            return 'Gemini';
        }

        // GPT 系列
        if (normalized.includes('gpt')) {
            const isOss = normalized.includes('oss');
            const sizeMatch = normalized.match(/(\d+b)/i);
            if (sizeMatch) {
                return isOss ? `GPT-OSS ${sizeMatch[1].toUpperCase()}` : `GPT ${sizeMatch[1].toUpperCase()}`;
            }
            return isOss ? 'GPT-OSS' : 'GPT';
        }

        // 其他模型按首个单词分组
        const firstWord = modelName.split(/[\s\-_]/)[0];
        return firstWord || 'Other';
    }

    /**
     * 获取所有已分组的模型名称
     */
    static getGroupedModels(config: ModelGroupsConfig): Set<string> {
        const grouped = new Set<string>();
        for (const group of config.groups) {
            for (const model of group.models) {
                grouped.add(model);
            }
        }
        return grouped;
    }

    /**
     * 获取未分组的模型
     */
    static getUngroupedModels(config: ModelGroupsConfig, allModels: ModelInfo[]): ModelInfo[] {
        const grouped = this.getGroupedModels(config);
        return allModels.filter(m => !grouped.has(m.name));
    }

    /**
     * 初始化默认分组（仅在首次安装时调用）
     * 当分组配置为空时，创建一个名为 "Group1" 的默认分组，
     * 并将所有传入的模型加入该分组。
     * 
     * @param models 当前账号下的所有模型
     * @returns 更新后的配置（如果进行了初始化），否则返回 null
     */
    static initDefaultGroupIfNeeded(models: ModelInfo[]): ModelGroupsConfig | null {
        const config = this.loadGroups();
        
        // 仅当分组列表为空且从未执行过自动分组时触发
        if (config.groups.length === 0 && config.lastAutoGrouped === null) {
            const now = Date.now();
            const defaultGroup: ModelGroup = {
                id: `group_${now}_default`,
                name: 'Group1',
                models: models.map(m => m.name),
                createdAt: now,
                updatedAt: now
            };
            
            const newConfig: ModelGroupsConfig = {
                groups: [defaultGroup],
                lastAutoGrouped: now  // 标记已初始化，防止重复触发
            };
            
            this.saveGroups(newConfig);
            console.log(`[ModelGroupManager] 首次安装：已创建默认分组 "Group1"，包含 ${models.length} 个模型`);
            return newConfig;
        }
        
        return null;
    }
}
