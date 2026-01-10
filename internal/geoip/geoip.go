package geoip

import (
	"log"
	"net"
	"sync"

	"github.com/oschwald/geoip2-golang"
)

var (
	db   *geoip2.Reader
	once sync.Once
)

// Init initializes the GeoIP database.
// It attempts to load from the provided path.
func Init(dbPath string) {
	once.Do(func() {
		var err error
		db, err = geoip2.Open(dbPath)
		if err != nil {
			log.Printf("Warning: Could not open GeoIP database at %s: %v. GeoIP features will be disabled.", dbPath, err)
			return
		}
		log.Printf("GeoIP database loaded successfully from %s", dbPath)
	})
}

// Location represents a simplified geo location
type Location struct {
	City        string
	CountryCode string
	Latitude    float64
	Longitude   float64
}

// LookupIP returns the location for a given IP address.
func LookupIP(ipStr string) *Location {
	if db == nil {
		return nil
	}

	ip := net.ParseIP(ipStr)
	if ip == nil {
		return nil
	}

	record, err := db.City(ip)
	if err != nil {
		// Log debug if needed, but usually just return nil
		return nil
	}

	return &Location{
		City:        record.City.Names["en"],
		CountryCode: record.Country.IsoCode,
		Latitude:    record.Location.Latitude,
		Longitude:   record.Location.Longitude,
	}
}

// Close closes the database connection
func Close() {
	if db != nil {
		db.Close()
	}
}
