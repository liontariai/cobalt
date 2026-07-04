import crypto from "crypto";

const MAX_TYPENAME_LENGTH = 40;
const TYPENAME_PREFIX_LENGTH = 30;
const TYPENAME_HASH_LENGTH = 8;

export const purifyTypename = (typename: string) =>
    typename.replaceAll("!", "").replaceAll("[", "").replaceAll("]", "");

export const shortenTypename = (typename: string) => {
    if (typename.length <= MAX_TYPENAME_LENGTH) {
        return typename;
    }

    const hash = crypto.createHash("md5").update(typename).digest("hex");
    return `${typename.slice(0, TYPENAME_PREFIX_LENGTH)}_${hash.slice(0, TYPENAME_HASH_LENGTH)}`;
};

export const normalizeTypename = (typename: string) =>
    shortenTypename(purifyTypename(typename));
