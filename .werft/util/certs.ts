import {exec, ExecOptions} from "./shell";
import {
    CORE_DEV_KUBECONFIG_PATH,
} from "../jobs/build/const";
import { Werft } from "./werft";
import { reportCertificateError } from "../util/slack";
import {JobConfig} from "../jobs/build/job-config";

export class InstallCertificateParams {
    certName: string;
    certSecretName: string;
    certNamespace: string;
    destinationNamespace: string;
    destinationKubeconfig: string;
}

export async function certReady(werft: Werft, config: JobConfig, slice: string): Promise<boolean> {
    const certName = `harvester-${config.previewEnvironment.destname}`;
    if (isCertReady(certName)){
        werft.log(slice, `Certificate ready`);
        return true
    }

    const certReady = waitCertReady(certName)

    if (!certReady) {
        retrieveFailedCertDebug(certName, slice)
        werft.fail(slice, `Certificate ${certName} never reached the Ready state`)
    }

    return certReady
}

function waitCertReady(certName: string): boolean {
    const timeout = "500s"
    const rc = exec(
        `kubectl --kubeconfig ${CORE_DEV_KUBECONFIG_PATH} wait --for=condition=Ready --timeout=${timeout} -n certs certificate ${certName}`,
        { dontCheckRc: true },
    ).code
    return rc == 0
}

function isCertReady(certName: string): boolean {
    const output = exec(
        `kubectl --kubeconfig ${CORE_DEV_KUBECONFIG_PATH} -n certs get certificate ${certName} -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}'`,
        { dontCheckRc: true }
    ).stdout.trim();

    return output == "True";
}

function retrieveFailedCertDebug(certName: string, slice: string) {
    const certificateYAML = exec(
        `kubectl --kubeconfig ${CORE_DEV_KUBECONFIG_PATH} -n certs get certificate ${certName} -o yaml`,
        { silent: true },
    ).stdout.trim();
    const certificateDebug = exec(`KUBECONFIG=${CORE_DEV_KUBECONFIG_PATH} cmctl status certificate ${certName} -n certs`);

    reportCertificateError({ certificateName: certName, certifiateYAML: certificateYAML, certificateDebug: certificateDebug }).catch((error: Error) =>
        console.error("Failed to send message to Slack", error),
    );
}

export async function installCertificate(werft, params: InstallCertificateParams, shellOpts: ExecOptions) {
    copyCachedSecret(werft, params, shellOpts.slice);
}

function copyCachedSecret(werft: Werft, params: InstallCertificateParams, slice: string) {
    werft.log(
        slice,
        `copying certificate from "${params.certNamespace}/${params.certName}" to "${params.destinationNamespace}/${params.certSecretName}"`,
    );
    const cmd = `kubectl --kubeconfig ${CORE_DEV_KUBECONFIG_PATH} get secret ${params.certName} --namespace=${params.certNamespace} -o yaml \
    | yq d - 'metadata.namespace' \
    | yq d - 'metadata.uid' \
    | yq d - 'metadata.resourceVersion' \
    | yq d - 'metadata.creationTimestamp' \
    | yq d - 'metadata.ownerReferences' \
    | sed 's/${params.certName}/${params.certSecretName}/g' \
    | kubectl --kubeconfig ${params.destinationKubeconfig} apply --namespace=${params.destinationNamespace} -f -`;

    const rc = exec(cmd, { slice: slice, dontCheckRc: true }).code;

    if (rc != 0) {
        werft.fail(
            slice,
            `Failed to copy certificate. Destination namespace: ${params.destinationNamespace}. Destination Kubeconfig: ${params.destinationKubeconfig}`,
        );
    }
}
