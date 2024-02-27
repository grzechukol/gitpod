/**
 * Copyright (c) 2024 Gitpod GmbH. All rights reserved.
 * Licensed under the GNU Affero General Public License (AGPL).
 * See License.AGPL.txt in the project root for license information.
 */

import { useCallback, useMemo, useState } from "react";
import { LoadingButton } from "@podkit/buttons/LoadingButton";
import { Button } from "@podkit/buttons/Button";
import { SwitchInputField } from "@podkit/switch/Switch";
import { cn } from "@podkit/lib/cn";
import { CpuIcon } from "lucide-react";
import { UseMutationResult } from "@tanstack/react-query";
import { AllowedWorkspaceClass, DEFAULT_WS_CLASS } from "../data/workspaces/workspace-classes-query";
import { MiddleDot } from "./typography/MiddleDot";
import { useToast } from "./toasts/Toasts";
import Modal, { ModalBody, ModalFlexFooter, ModalFooterAlert, ModalHeader } from "./Modal";

export const WorkspaceClassesOptions = (props: {
    classes: AllowedWorkspaceClass[];
    defaultClass?: string;
    className?: string;
}) => {
    return (
        <div className={cn("space-y-2", props.className)}>
            {props.classes.map((cls) => (
                <div className="flex gap-2 items-center">
                    <CpuIcon size={20} />
                    <div>
                        <span className="font-medium text-pk-content-primary">{cls.displayName}</span>
                        <MiddleDot />
                        <span className="text-pk-content-primary">{cls.description}</span>
                        {props.defaultClass === cls.id && (
                            <>
                                <MiddleDot className="text-pk-content-tertiary" />
                                <span className="text-pk-content-tertiary">default</span>
                            </>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

export interface WorkspaceClassesModifyModalProps {
    defaultClass?: string;
    restrictedWorkspaceClasses: string[];
    showSetDefaultButton: boolean;

    allowedClasses: AllowedWorkspaceClass[];
    updateMutation: UseMutationResult<void, Error, { restrictedWorkspaceClasses: string[]; defaultClass?: string }>;

    onClose: () => void;
}

export const WorkspaceClassesModifyModal = ({
    onClose,
    updateMutation,
    allowedClasses,
    showSetDefaultButton,
    ...props
}: WorkspaceClassesModifyModalProps) => {
    const [defaultClass, setDefaultClass] = useState(props.defaultClass || DEFAULT_WS_CLASS);
    const [restrictedClasses, setRestrictedClasses] = useState(props.restrictedWorkspaceClasses ?? []);
    const { toast } = useToast();

    const handleUpdate = async () => {
        if (computedError) {
            return;
        }
        updateMutation.mutate(
            { restrictedWorkspaceClasses: restrictedClasses, defaultClass },
            {
                onSuccess: () => {
                    toast({ message: "Workspace class updated" });
                    onClose();
                },
            },
        );
    };

    const computedError = useMemo(() => {
        const leftOptions =
            allowedClasses.filter((c) => !c.isDisabledInScope && !restrictedClasses.includes(c.id)) ?? [];
        if (leftOptions.length === 0) {
            return "Must have at least one class.";
        }
        if (!defaultClass || !leftOptions.find((cls) => cls.id === defaultClass)) {
            return "Must have default class.";
        }
        return;
    }, [restrictedClasses, allowedClasses, defaultClass]);

    const makeDefaultButtonState = useCallback(
        (classId: string) => {
            const targetClass = allowedClasses.find((e) => e.id === classId)!;
            if (targetClass.isDisabledInScope) {
                let descriptionScope = "";
                switch (targetClass.disableScope!) {
                    case "organization":
                        descriptionScope = "Your organization";
                        break;
                    case "configuration":
                        descriptionScope = "Current configuration";
                        break;
                }
                return {
                    title: "Unavailable",
                    classes: "cursor-not-allowed",
                    disabled: true,
                    switchDescription: `${descriptionScope} has disabled this class`,
                };
            }
            if (restrictedClasses.includes(classId)) {
                return {
                    title: "Unavailable",
                    classes: "cursor-not-allowed",
                    disabled: true,
                    switchDescription: "Current configuration has disabled this class",
                };
            }
            if (defaultClass === classId) {
                return {
                    title: "Default",
                    classes: "text-pk-surface",
                    disabled: true,
                };
            }
            return {
                title: "Set default",
                classes: "cursor-pointer text-blue-500",
                disabled: false,
            };
        },
        [restrictedClasses, allowedClasses, defaultClass],
    );

    return (
        <Modal visible onClose={onClose} onSubmit={handleUpdate}>
            <ModalHeader>Available workspace classes</ModalHeader>
            <ModalBody>
                <div>
                    {allowedClasses.map((wsClass) => (
                        <SwitchInputField
                            className="mt-2"
                            key={wsClass.id}
                            id={wsClass.id}
                            label={wsClass.displayName}
                            description={wsClass.description}
                            checked={!restrictedClasses.includes(wsClass.id)}
                            disabled={wsClass.isDisabledInScope}
                            onCheckedChange={(checked) => {
                                const newVal = !checked
                                    ? restrictedClasses.includes(wsClass.id)
                                        ? [...restrictedClasses]
                                        : [...restrictedClasses, wsClass.id]
                                    : restrictedClasses.filter((id) => id !== wsClass.id);
                                setRestrictedClasses(newVal);
                            }}
                            title={makeDefaultButtonState(wsClass.id).switchDescription}
                            rightItem={
                                !showSetDefaultButton ? undefined : (
                                    <Button
                                        title={makeDefaultButtonState(wsClass.id).switchDescription}
                                        onClick={() => {
                                            setDefaultClass(wsClass.id);
                                        }}
                                        variant="ghost"
                                        disabled={makeDefaultButtonState(wsClass.id).disabled}
                                        className={cn(
                                            "text-sm select-none font-normal",
                                            makeDefaultButtonState(wsClass.id).classes,
                                        )}
                                    >
                                        {makeDefaultButtonState(wsClass.id).title}
                                    </Button>
                                )
                            }
                        />
                    ))}
                </div>
            </ModalBody>
            <ModalFlexFooter
                alert={
                    updateMutation.isError ? (
                        <ModalFooterAlert type="danger">{String(updateMutation.error)}</ModalFooterAlert>
                    ) : (
                        computedError && <>{computedError}</>
                    )
                }
            >
                <Button variant="secondary" onClick={onClose}>
                    Cancel
                </Button>
                <LoadingButton disabled={!!computedError} type="submit" loading={updateMutation.isLoading}>
                    Save
                </LoadingButton>
            </ModalFlexFooter>
        </Modal>
    );
};
