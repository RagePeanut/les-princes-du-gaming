import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    service = new ToastService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should start with no toasts', () => {
    expect(service.toasts()).toEqual([]);
  });

  it('should add an error toast', () => {
    service.error('Something went wrong');
    const toasts = service.toasts();
    expect(toasts.length).toBe(1);
    expect(toasts[0].type).toBe('error');
    expect(toasts[0].message).toBe('Something went wrong');
  });

  it('should add a success toast', () => {
    service.success('All good!');
    expect(service.toasts()[0].type).toBe('success');
  });

  it('should add an info toast', () => {
    service.info('FYI');
    expect(service.toasts()[0].type).toBe('info');
  });

  it('should add toast with retry callback', () => {
    const retry = vi.fn();
    service.error('Failed', retry);
    expect(service.toasts()[0].retry).toBe(retry);
  });

  it('should auto-dismiss after 5 seconds', () => {
    service.error('Temporary');
    expect(service.toasts().length).toBe(1);
    vi.advanceTimersByTime(5000);
    expect(service.toasts().length).toBe(0);
  });

  it('should dismiss a specific toast by id', () => {
    service.error('First');
    service.error('Second');
    const firstId = service.toasts()[0].id;
    service.dismiss(firstId);
    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].message).toBe('Second');
  });

  it('should assign unique ids to toasts', () => {
    service.error('A');
    service.error('B');
    service.error('C');
    const ids = service.toasts().map((t) => t.id);
    expect(new Set(ids).size).toBe(3);
  });
});
