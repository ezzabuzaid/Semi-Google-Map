/// <reference types="@types/googlemaps" />
import { Observable, fromEventPattern, of, Observer, zip } from 'rxjs';
import { map, share, tap, switchMap, last, merge, catchError } from 'rxjs/operators';
export namespace Map {
    export class GoogleMapClass extends google.maps.Map {

        private markers: google.maps.Marker[] = [];

        private mapRef: google.maps.Map;

        /**
        *
        * @param latLng used as fallback if the geolocation faild to locate the current address and if it disabled
        * e.g :: { lat: 35, lng: 35 }
        */
        constructor({ latitude, longitude }: Position, mapElement: HTMLElement) {
            super(mapElement, {
                center: new google.maps.LatLng(latitude, longitude),
                zoom: 15
            });
            this.mapRef = (this as any);
            const mixin = (...t) => {
                t.reduce((base, c) => (class extends base { }), class { });
            };
        }

        /**
         *
         * @param {google.maps.places.PlaceGeometry} place place geometry
         * please notice that this will be deprecated as soon as possible;
         */
        toPlace({ viewport, location }: google.maps.places.PlaceGeometry) {
            if (viewport) {
                this.fitBounds(viewport);
            } else {
                this.setCenter(location);
                this.panTo(location);
            }
            return this;
        }

        infoWindowPopup(pos: google.maps.LatLng | google.maps.LatLngLiteral) {
            const infoWindow = new google.maps.InfoWindow;
            infoWindow.setPosition(pos);
            return infoWindow;
        }

        /**
         * @param {google.maps.Marker} marker
         */
        moveMarkerWithMap(marker: google.maps.Marker) {
            // this method must be moved to seperate class
            // seperate the method to follow single responsiblity function
            fromEventPattern((handler) => this.addListener('drag', handler.bind(null)))
                .pipe(tap(() => { marker.setPosition(this.getCenter()); }))
                .subscribe();
            return fromEventPattern((handler) => this.addListener('dragend', handler.bind(null)))
                .pipe(switchMap(() => GoogleMapService.reversePlaceDetails('location', marker.getPosition())));
        }

        removeMarkers() {
            this.markers.forEach(marker => {
                marker.setMap(null);
            });
            this.markers = [];
        }

        initMarker(position: google.maps.LatLng | google.maps.LatLngLiteral) {
            const marker = new google.maps.Marker({
                position,
                map: this.mapRef,
                animation: google.maps.Animation.DROP,
            });
            this.markers.push(marker);
            this.panTo(position);
            // marker.setPosition(position);
            return marker;
        }

        marker(index): google.maps.Marker {
            return this.markers[index];
        }

    }
    export class GoogleMapService {
        public static autoCompleteRef: google.maps.places.Autocomplete;
        /**
         * @param fallback used if current location is not supported or user has denied to use current location
         * when it called it's check if the navigator is supported and if it check for the user response
         * if both rejected this method will retrun an error otherwise
         * it will check that the browser is good enough to use the power of getlocation
         * therefore it will return the current location or an error tells you that there's something with the browser
         */
        public static getCurrentLocation(position: Position): Observable<Position> {
            const observable = Observable.create((observer: Observer<Position>) => {
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(({ coords: { latitude, longitude } }) => {
                        observer.next({ latitude, longitude });
                        observer.complete();
                    }, () => {
                        observer.next(position);
                        observer.complete();
                        // observer.error('an error accourd to browser');
                    });
                } else {
                    // Browser doesn't support Geolocation or user decide to not get the current location
                    // or user has decied to not use geolocation
                    // observer.error('User decide to not use geolocation or browser doesn\'t support it');
                    observer.next(position);
                    observer.complete();
                }
            });
            return observable;
        }
        /**
         * @param way is string to used as search by e.g: location, placeId
         * @param value the value to search
         * if position supplied, accept valid lat, lng to reverse the position and get place info
         * if geocoder status is not { OK } this mean the position hasn't a geometry therefore current location will used
         */
        public static reversePlaceDetails(way: AddressInfoType, value: google.maps.LatLng | string): Observable<google.maps.GeocoderResult[]> {
            //! instead of making a new observable, use bindcallback
            const geocoder = new google.maps.Geocoder;
            const by = {};
            by[way] = value;
            const observable = Observable.create((observer: Observer<google.maps.GeocoderResult[]>) => {
                geocoder.geocode(by, (results, status) => {
                    if (status.toString() === 'OK') {
                        console.log('Resulte from reverse place details:: ', results);
                        if (results[0]) {
                            observer.next(results);
                            observer.complete();
                        } else {
                            observer.error(null);
                        }
                    } else {
                        observer.error(null);
                    }
                });
            });
            return observable;
        }
        /**
         * @param {Array<google.maps.GeocoderAddressComponent>} address_components
         * the address_components the produced from nethier geocoder result or place resulte e.g autcomplete
         * @param typeValue see google maps types
         */
        public static addressInfo(address_components: google.maps.GeocoderResult[] | google.maps.GeocoderAddressComponent, typeValue): google.maps.GeocoderAddressComponent {
            const searchIn = list => {
                for (const i of list) {
                    if (i.types.some(el => el === typeValue)) {
                        return i;
                    }
                }
            };
            if (Array.isArray(address_components)) {
                for (const component of address_components) {
                    const found = searchIn(component.address_components);
                    if (found)
                        return found;
                }
            }
            else if (!!address_components)
                return searchIn(address_components);
            else
                return null;
        }
        /**
         * @param {HtmlInputElement} input html input to listen to it's event
         */
        public static autoComplete(input: HTMLInputElement): Observable<google.maps.places.PlaceResult> {
            /**
             * !Disable autocomplete submit event
             */
            google.maps.event.addDomListener(input, 'keydown', (event) => {
                if (event.keyCode === 13) {
                    event.preventDefault();
                }
            });
            const autocomplete = new google.maps.places.Autocomplete(input, { type: 'geocode' });
            this.autoCompleteRef = autocomplete;
            const event = fromEventPattern(handler => autocomplete.addListener('place_changed', handler.bind(null)));
            return event.pipe(map(() => autocomplete.getPlace()));
        }
    }
    export class GoogleMapUtils {
        static sameCity(place, position) {
            return zip(
                GoogleMapService.reversePlaceDetails('placeId', place),
                GoogleMapService.reversePlaceDetails('location', position)
            ).pipe(
                map(([selectedCityResult, currentCityResult]) => {
                    console.log(selectedCityResult, currentCityResult);
                    if (!(currentCityResult && selectedCityResult)) {
                        return { same: false };
                    } else {
                        const selectedCityType = GoogleMapService.addressInfo(selectedCityResult, 'locality');
                        const currentCityType = GoogleMapService.addressInfo(currentCityResult, 'locality');
                        console.log(selectedCityType, currentCityType);
                        if (!(currentCityType && selectedCityType)) {
                            return { same: false }
                        } else {
                            return selectedCityType.long_name === currentCityType.long_name ? { same: true } : { same: false };
                        }
                    }
                }),
                catchError(error => of({ same: false })));
        }

        static isCountry(place) {
            return place.types.some(el => el === 'country');
        }

        static isCity(place) {
            return place.types.some(el => el === 'locality');
        }

        static initPostition(position?: Position | string): Observable<Position> {
            console.log(position);
            if (!!position) {
                if (typeof position !== 'string')
                    return of(position);
                else {
                    return GoogleMapService.reversePlaceDetails('placeId', position)
                        .pipe(map(([geocode]) => {
                            const { lat, lng } = geocode.geometry.location.toJSON();
                            return { latitude: lat, longitude: lng };
                        }));
                }
            } else
                return GoogleMapService.getCurrentLocation({ latitude: 35, longitude: 33 });
        }

        static initMap(mapElement: HTMLElement, position?: Position) {
            return this.initPostition(position)
                .pipe(map(pos => {
                    const mapRef = new GoogleMapClass(pos, mapElement);
                    return mapRef;
                }));
        }

    }
}

export interface Position {
    latitude: number;
    longitude: number;
}

type AddressInfoType = 'placeId' | 'location';
