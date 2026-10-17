import { Module } from '@nestjs/common';
import { AppointmentsController, AvailabilityController } from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';
import { CALENDAR_PROVIDER, SimulatedCalendarProvider } from './calendar-provider.js';

/** Appointments (ADR-025, Phase 6). CalendarProvider is simulated until the real adapter lands. */
@Module({
  controllers: [AppointmentsController, AvailabilityController],
  providers: [
    AppointmentsService,
    {
      provide: CALENDAR_PROVIDER,
      useFactory: () => new SimulatedCalendarProvider(),
    },
  ],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
