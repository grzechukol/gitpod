/**
 * Copyright (c) 2023 Gitpod GmbH. All rights reserved.
 * Licensed under the GNU Affero General Public License (AGPL).
 * See License.AGPL.txt in the project root for license information.
 */

import { useQuery } from "@tanstack/react-query";
import { workspaceClient } from "../../service/public-api";
import { WorkspaceClass } from "@gitpod/public-api/lib/gitpod/v1/workspace_pb";
import { useOrgSettingsQuery } from "../organizations/org-settings-query";
import { Configuration } from "@gitpod/public-api/lib/gitpod/v1/configuration_pb";
import { useMemo } from "react";
import { PlainMessage } from "@bufbuild/protobuf";
import { useConfiguration } from "../configurations/configuration-queries";

export const DEFAULT_WS_CLASS = "g1-standard";

export const useWorkspaceClasses = () => {
    return useQuery<WorkspaceClass[]>({
        queryKey: ["workspace-classes"],
        queryFn: async () => {
            const response = await workspaceClient.listWorkspaceClasses({});
            return response.workspaceClasses;
        },
        cacheTime: 1000 * 60 * 60, // 1h
        staleTime: 1000 * 60 * 60, // 1h
    });
};

type Scope = "organization" | "configuration" | "installation";
type DisableScope = "organization" | "configuration";
export type AllowedWorkspaceClass = PlainMessage<WorkspaceClass> & {
    isDisabledInScope?: boolean;
    disableScope?: DisableScope;
};
export const useAllowedWorkspaceClassesMemo = (
    configurationId?: Configuration["id"],
    options?: { filterOutDisabled: boolean; ignoreScope?: DisableScope[] },
) => {
    const { data: orgSettings } = useOrgSettingsQuery();
    const { data: installationClasses } = useWorkspaceClasses();
    // empty configurationId will return undefined
    const { data: configuration } = useConfiguration(configurationId ?? "");

    return useMemo(() => {
        let data: AllowedWorkspaceClass[] = installationClasses ?? [];
        let scope: Scope = "installation";
        if (data.length === 0) {
            return { data, scope };
        }
        if (
            !options?.ignoreScope?.includes("organization") &&
            orgSettings?.allowedWorkspaceClasses &&
            orgSettings.allowedWorkspaceClasses.length > 0
        ) {
            data = data.map((cls) => ({
                ...cls,
                isDisabledInScope: !orgSettings.allowedWorkspaceClasses.includes(cls.id),
                disableScope: "organization",
            }));
            scope = "organization";
        }
        if (
            !options?.ignoreScope?.includes("configuration") &&
            configuration?.workspaceSettings?.restrictedWorkspaceClasses &&
            configuration.workspaceSettings.restrictedWorkspaceClasses.length > 0
        ) {
            const restrictedClasses = configuration.workspaceSettings.restrictedWorkspaceClasses;
            data = data.map((cls) => {
                if (cls.isDisabledInScope) {
                    return cls;
                }
                return {
                    ...cls,
                    isDisabledInScope: restrictedClasses.includes(cls.id),
                    disableScope: "configuration",
                };
            });
            scope = "configuration";
        }
        if (options?.filterOutDisabled) {
            return { data: data.filter((e) => !e.isDisabledInScope), scope };
        }
        return { data, scope };
    }, [installationClasses, orgSettings, options, configuration?.workspaceSettings?.restrictedWorkspaceClasses]);
};
