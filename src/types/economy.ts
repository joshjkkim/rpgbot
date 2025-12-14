export interface shopCategoryConfig {
    id: string;
    name: string;
    icon?: string;
    description?: string;
    sortOrder?: number;

    hidden?: boolean;
    roleRequiredIds?: string[];
}

export interface shopItemAction {
    type: "assignRole" | "removeRole" | "sendMessage" | "runCommand" | "giveStat";
    roleId?: string;
    message?: string;
    channelId?: string;
    command?: string;
    statId?: string;
    amount?: number;
}
export interface shopItemConfig {
    id: string;
    name: string;
    emoji?: string;
    description?: string;

    categoryId: string;

    price: number;
    sellPrice?: number | null;

    minLevel?: number;
    requiresRoleIds?: string[];
    maxPerUser?: number;
    stock?: number | null;
    hidden?: boolean;
    permanent?: boolean;
    tradeable?: boolean;

    actions?: Record<number, shopItemAction>;
}