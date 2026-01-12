import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

if (typeof window !== "undefined") {
setOptions({
    key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY,
    v: "weekly",
    libraries: ["places"],
    language: "en"
})
}

export const LoadPlacesLibrary = () => importLibrary("places");
 